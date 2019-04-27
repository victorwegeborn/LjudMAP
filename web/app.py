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



'''

{
    sessions: {
        current: string,
        previous: [
            string,
            string,
              .
              .
              .
            string
        ]
    },
    settings: {
        segmentation: {
            mode: 'uniform' | 'coagulated' | 'beat',
            size: int (ms) | null,
            step: int (ms) | null
        },
        cluster: {
            components: [2] | [3] | [2,3],
            neighbours: int,
            metric: string,
            labels: null | [int]
        }
    },
    features: {
        mfccs: {
            disabled: boolean,
            coefficients: int,
            delta: boolean,
            deltadelta: boolean
        },
        spectrals: {
            disabled: boolean,
            flux: boolean,
            flux_centroid: boolean,
            centroid: boolean,
            harmonicity: boolean,
            flatness: boolean,
            slope: boolean
        },
        signals: {
            disabled: boolean
            zcr: boolean,
            rms: boolean
        }
    }
}


'''

def parse_request(request):

    settings = json.loads(request.form['settings'])
    features = json.loads(request.form['features'])

    # ensure segmentation is unifrom, coagulated, or beat-based
    if settings['segmentation']['mode'] == 'uniform':
        settings['segmentation']['size'] = float(settings['segmentation']['size'])
        settings['segmentation']['step'] = float(settings['segmentation']['step'])
    if settings['segmentation']['mode'] == 'coagulated':
        settings['segmentation']['threshold'] = float(settings['segmentation']['threshold'])

    # parse cluster settings
    settings['cluster']['components'] = json.loads(settings['cluster']['components'])
    settings['cluster']['neighbours'] = int(settings['cluster']['neighbours'])

    # coefficients
    features['mfccs']['coefficients'] = int(features['mfccs']['coefficients'])

    print('Parsed settings:', json.dumps(settings, indent=2))
    print('Parsed features:', json.dumps(features, indent=2))

    return settings, features

def handle_sessions(sessions=None):
    new_key = str(time.time()).split(".")[0] + str(time.time()).split(".")[1]
    if sessions:
        sessions = json.loads(sessions)
        sessions['previous'].append(sessions['current'])
        sessions['current'] = new_key
        return sessions
    else:
        return {
            'current': new_key,
            'previous': []
        }


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
            sessions = handle_sessions()
            print(sessions)
            subprocess.call(['mkdir', UPLOAD_FOLDER + sessions['current']])
            print('mkdir ' +  UPLOAD_FOLDER + sessions['current'])
            # save all files in folder
            for index, file in request.files.items():
                print(file.filename)
                if file.filename == '' and not allowed_file(file.filename):
                    flash('No selected file')
                    return "<h3>Something went wrong, possibly relating to the name of the file.</h3>"
                # secure and store file
                filename = secure_filename(file.filename)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], sessions['current'] + "/" + filename))
                print(file.filename + " saved")

    # parse and format the form data
    settings, features = parse_request(request)

    # process audio according to passed data
    audio_processing.main(sessions, settings, features)

    # pass response with redirect url
    return jsonify(dict(redirect='/' + sessions['current']))

# Triggered when searching by key, if key exists go to load_browser()
@app.route('/retrain', methods=['POST'])
def retrain() -> str:
    print("INSIDE RETRAIN")
    if request.method == 'POST':
        # parse points
        points = json.loads(request.form['points'])

        # parse meta data
        settings, _ = parse_request_form(request)

        # get session tree
        sessions = handle_sessions(request.form['sessions'])

        # get audio path
        filename = request.form['audioPath'].split("/")[-1]

        subprocess.call(['mkdir', UPLOAD_FOLDER + sessions['current']])
        subprocess.call(['cp', UPLOAD_FOLDER + sessions['previous'][0] + "/" + filename, UPLOAD_FOLDER + sessions['current'] + "/" + filename])

        audio_processing.retrain(points, sessions, settings)
        return jsonify(dict(redirect='/' + sessions['current']))
    return ''

# triggered when new set of features are requested
@app.route('/features', methods=['POST'])
def new_features() -> str:
    if request.method == 'POST':
        # parse meta data
        settings, features = parse_request(request)

        # get users current labeling
        labels = None
        if 'labels' in request.form and request.form is not None:
            labels = json.loads(request.form['labels'])


        # copy session key and create new key
        sessions = handle_sessions(request.form['sessions'])

        filename = request.form['audioPath'].split("/")[-1]

        # make new dir for the new data
        subprocess.call(['mkdir', UPLOAD_FOLDER + sessions['current']])
        subprocess.call(['cp', UPLOAD_FOLDER + sessions['previous'][0] + "/" + filename, UPLOAD_FOLDER + sessions['current'] + "/" + filename])

        # process new features and send user to new plot
        audio_processing.new_features(labels, sessions, settings, features)
        return jsonify(dict(redirect='/' + sessions['current']))
    return ''


# Performs coagulation. Only available when one song has been uploaded!!
@app.route('/coagulate', methods=['POST'])
def run_coagulate() -> str:
    if request.method == 'POST':
        # parse meta data
        settings, features = parse_request(request)

        # copy session key and create new key
        old_session_key = request.form['sessionKey']
        filename = request.form['audioPath'].split("/")[-1]
        new_session_key = str(time.time()).split(".")[0] + str(time.time()).split(".")[1]

        # make new dir for the new data
        subprocess.call(['mkdir', UPLOAD_FOLDER + new_session_key])
        subprocess.call(['cp', UPLOAD_FOLDER + old_session_key + "/" + filename, UPLOAD_FOLDER + new_session_key + "/" + filename])

        audio_processing.coagulate(new_session_key, old_session_key, settings, features)
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


@app.route("/recent/<string:id>", methods=['GET', 'POST'])
def serve_previous_meta_data(id) -> str:
    data_dir = "static/data/" + id + "/"
    if os.path.isdir(data_dir):
        if os.path.isfile(data_dir + "data.json"):
            with open(data_dir + "data.json", "r") as f:
                data = json.load(f)
        return jsonify({
            'features': data['meta']['features'],
            'settings': data['meta']['settings']
        })
    else:
        return ''


@app.route("/batch_upload", methods=["POST"])
def upload() -> str:
    print(request.files)
    return ""


@app.route('/modal/<string:target>', methods=['GET', 'POST'])
def load_modal(target) -> str:
    print(target)
    modal_dir = "templates/modals/"
    content = ""
    if os.path.isfile(modal_dir + target + '.html'):
        with open(modal_dir + target + '.html', "r") as f:
            content = f.read();
    else:
        print('modal template not found!!')
    return content

if __name__ == '__main__':
    #app.run(debug=True)
    app.run(host='0.0.0.0', debug=True, port=3134)
