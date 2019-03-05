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

app = Flask(__name__)
app.secret_key = 'hejhej00'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def parse_request_form(form):
    features = {}
    segmentation = {}

    # here we will deal with layers in the feature
    segmentation['size'] = float(form['radio1'])
    segmentation['step'] = float(form['radio2'])

    if 'MFCC' in form:
        print('using mfccs')
        features['MFCC'] = {}
        features['MFCC']['coefficients'] = form['mfcc_coefficients']
        features['MFCC']['delta'] = True if 'mfcc_delta' in form else False
        features['MFCC']['deltadelta'] = True if 'mfcc_deltadelta' in form else False

    if 'SPECTRAL' in form:
        print('using spectral')
        features['SPECTRAL'] = {}
        features['SPECTRAL']['flux'] = True if 'flux' in form else False
        features['SPECTRAL']['fluxCentroid'] = True if 'fluxCentroid' in form else False
        features['SPECTRAL']['centroid'] = True if 'centroid' in form else False
        features['SPECTRAL']['harmonicity'] = True if 'harmonicity' in form else False
        features['SPECTRAL']['flatness'] = True if 'flatness' in form else False
        features['SPECTRAL']['rolloff'] = True if 'rolloff' in form else False
    print(segmentation)
    print(features)
    return segmentation, features




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
    print(json.dumps(request.form, indent=2))
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('No file part')
            return "<h3>No submitted file. Please go back and choose an audio file.</h3>"
        else:
            file = request.files['file']
            if file.filename == '':
                flash('No selected file')
                return "<h3>Something went wrong, possibly relating to the name of the file.</h3>"
            if file and allowed_file(file.filename):
                session_key = str(time.time()).split(".")[0] + str(time.time()).split(".")[1]
                filename = secure_filename(file.filename)
                subprocess.call(['mkdir', UPLOAD_FOLDER + session_key])
                print('mkdir ' +  UPLOAD_FOLDER + session_key)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], session_key + "/" + filename))
                print(file.filename + " saved")
            else:
                print("File extension not allowed")
                return "<h3>File extension not allowed. Please use WAV or MP3.</h3>"

    segmentation, features = parse_request_form(request.form)
    if not features:
        flash('No features selected')
        return "<h3>You did not select any features. Try again.</h3>"

    audio_processing.main(session_key, segmentation, features)

    return redirect("/"+session_key)

# Triggered when searching by key, if key exists go to load_browser()
@app.route('/retrain', methods=['POST'])
def retrain() -> str:
    print("INSIDE RETRAIN")
    if request.method == 'POST':
        valid_points = json.loads(request.form['validPoints'])
        old_session_key = request.form['sessionKey']
        filename = request.form['audioPath'].split("/")[-1]

        # adapt for layers
        segmentation = {}
        segmentation['size'] = float(request.form['segmentSize'])
        segmentation['step'] = float(request.form['stepSize'])

        new_session_key = str(time.time()).split(".")[0] + str(time.time()).split(".")[1]

        subprocess.call(['mkdir', UPLOAD_FOLDER + new_session_key])
        subprocess.call(['cp', UPLOAD_FOLDER + old_session_key + "/" + filename, UPLOAD_FOLDER + new_session_key + "/" + filename])

        audio_processing.retrain(valid_points, new_session_key, old_session_key, segmentation)
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
        with open(data_dir + "data.json", "r") as f:
            data = json.load(f)

        #return render_template('audioBrowser.html',
        return render_template('deckAudioBrowser.html',
                                data=data['data'],
                                audioDuration=data['meta']["audio_duration"],
                                segmentSize=data['meta']["segment_size"],
                                audioPath="../" + data['meta']["audio_path"],
                                stepSize=data["meta"]['step_size'],
                                datapoints=len(data['data']),
                                session_key=session_key)

    else:
        return "<h3>Something went wrong, the files for the this audio session does not exist</h3>"

if __name__ == '__main__':
    #app.run(debug=True)
    app.run(host='0.0.0.0', debug=True, port=3134)
