# -*- coding: utf-8 -*-
import os

from flask import Flask, render_template, request, flash, redirect, jsonify
from werkzeug.utils import secure_filename
import subprocess
import sys
sys.path.append(os.path.abspath("../python"))
sys.path.append(os.path.abspath(".."))
import time
import audio_processing
from flask import send_file
import csv
import json

UPLOAD_FOLDER = 'static/uploads/'
ALLOWED_EXTENSIONS = set(['wav', 'mp3'])

app = Flask(__name__, template_folder='templates/')
app.secret_key = 'barabing'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def parse_request_form(form):

    # general settings for audio_processing
    settings = {
        'segment_size': float(form['segment_size']),
        'step_size': float(form['step_size']),
        'n_songs': form['n_songs'],
        'metric': ''.join(c.lower() for c in form['metric']),
        'n_neighbours': int(form['n_neighbours']),
        'components': json.loads(request.form['components'])
    }

    print('Parsed settings:', json.dumps(settings, indent=2))

    features = {}
    if 'mfccs' in form:
        features['MFCC'] = {}
        features['MFCC']['coefficients'] = float(form['mfccs'])
        features['MFCC']['delta'] = True if 'mfcc_delta' in form else False # Always default?
        features['MFCC']['deltadelta'] = True if 'mfcc_deltadelta' in form else False

    return settings, features




# Checks so file is allowed
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def upload_file():
    #subprocess.call('rm /uploads/*', shell=True)
    return render_template('index.html')

# When audio is submitted, checks so audio is valid, uploads it, and sends parameters
# to audio_processing which in turn generates files needed for browser, then
# redirects and loads browser.
@app.route('/process_audio', methods=['GET', 'POST'])
def process_audio() -> str:
    # Check so audio file is included and valid
    # print(json.dumps(request.form, indent=2))
    if request.method == 'POST':
        if '0' not in request.files:
            flash('No file part')
            return "<h3>No submitted file. Please go back and choose an audio file.</h3>"
        else:
            # create folder for this session
            session_key = str(time.time()).split(".")[0] + str(time.time()).split(".")[1]
            subprocess.call(['mkdir', UPLOAD_FOLDER + session_key])
            print('mkdir ' +  UPLOAD_FOLDER + session_key)
            # save all files in folder
            for index, file in request.files.items():
                print(file.filename)
                if file.filename == '' or not allowed_file(file.filename):
                    flash('No selected file')
                    return "<h3>Something went wrong, possibly relating to the name of the file.</h3>"
                # secure and store file
                filename = secure_filename(file.filename)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], session_key + "/" + filename))
                print(file.filename + " saved")

    # parse and format the form data
    settings, features = parse_request_form(request.form)

    # process audio according to passed data
    audio_processing.main(session_key, settings, features)

    # pass response with redirect url
    return jsonify(dict(redirect='/' + session_key))

# Triggered when searching by key, if key exists go to load_browser()
@app.route('/retrain', methods=['POST'])
def retrain() -> str:
    print("INSIDE RETRAIN")
    if request.method == 'POST':

        # parse points
        points = json.loads(request.form['points'])

        # parse meta data
        settings, _ = parse_request_form(request.form)

        old_session_key = request.form['sessionKey']
        filename = request.form['audioPath'].split("/")[-1]

        new_session_key = str(time.time()).split(".")[0] + str(time.time()).split(".")[1]

        subprocess.call(['mkdir', UPLOAD_FOLDER + new_session_key])
        subprocess.call(['cp', UPLOAD_FOLDER + old_session_key + "/" + filename, UPLOAD_FOLDER + new_session_key + "/" + filename])

        audio_processing.retrain(points, new_session_key, old_session_key, settings)
        return jsonify(dict(redirect='/' + new_session_key))
    return ''


# Triggered when searching by key, if key exists go to load_browser()
@app.route('/goByKey', methods=['POST'])
def goByKey() -> str:
    if request.method == 'POST':
        session_key = request.form['id']
        data_dir = "static/data/" + session_key + "/"
        if os.path.isdir(data_dir):
            return redirect("/"+session_key)
        else:
            return "<h3>Not a valid key.</h3>"

# Loads audio browser by session_key
@app.route('/<string:session_key>', methods=['GET', 'POST'])
def load_browser(session_key) -> str:
    data_dir = "static/data/" + session_key + "/"
    print(data_dir)
    if os.path.isdir(data_dir):
        if os.path.isfile(data_dir + "data.json"):
            with open(data_dir + "data.json", "r") as f:
                data = json.load(f)



        return render_template('audioBrowser.html',
                                data=data,
                                audioDuration=data['meta']["audio_duration"],
                                audioPath="../" + data['meta']["audio_path"],
                                session_key=session_key)

    else:
        return "<h3>Something went wrong, the files for the this audio session does not exist</h3>"



@app.route("/batch_upload", methods=["POST"])
def upload() -> str:
    print(request.files)
    return ""



if __name__ == '__main__':
    #app.run(debug=True)
    app.run(host='0.0.0.0', debug=True, port=3134)
