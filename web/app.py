"""



"""
import os
import io
from flask import Flask, render_template, request, flash, redirect, jsonify, make_response
from werkzeug.utils import secure_filename
import subprocess
import sys
sys.path.append(os.path.abspath("../python"))
sys.path.append(os.path.abspath(".."))
import time
import audio_processing
from flask import send_file
import io
from pydub import AudioSegment
import csv
import json

UPLOAD_FOLDER = 'static/uploads/'
ALLOWED_EXTENSIONS = set(['wav', 'mp3'])

app = Flask(__name__, template_folder='templates/')
app.secret_key = 'barabing'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


SAMPLE_RATE = 44100

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
    },
    sessions: {
        current: [key, date, time],
        previous: [
            [key, date, time],
                    .
                    .
                    .
            [key, date, time]
        ]
    }
    audios: {
        path: string,
        files: [
            [file_name, duration],
                    .
                    .
                    .
            [file_name, duration]
        ]
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
        settings['segmentation']['target'] = int(settings['segmentation']['target'])
        settings['segmentation']['size'] = float(settings['segmentation']['size'])
        settings['segmentation']['step'] = float(settings['segmentation']['step'])

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
    _date = str(time.strftime("%x"))
    _time = str(time.strftime("%X"))
    if sessions:
        sessions = json.loads(sessions)
        sessions['previous'].insert(0, sessions['current'])
        sessions['current'] = [new_key, _date, _time]
        return sessions
    else:
        return {
            'current': [new_key, _date, _time],
            'previous': []
        }



"""
Parses and stores audio. Enforces audio format to .wav and SAMPLE_RATE.
Currently supports mp3 and wav files.

TODO: add files to audios object

:param request: request containing wav/mp3 files
:param session: root session string, defaults to None
:param audios: audio location and meta object
"""
def store_audio(request, session=None, audios=None):
    store_time = time.time()

    if not audios:
        audios = {
            'path': os.path.join(app.config['UPLOAD_FOLDER'], session + "/"),
            'duration': 0,
            'files': []
        }

    # TODO: move these validations to client
    for _, file in request.files.items():
        if file.filename == '':
            flash('No selected file')
            return "<h3>Something went wrong, possibly relating to the name of the file.</h3>"
        if not allowed_file(file.filename):
            flash('not allowed file')
            return "<h3>Not allowed file: " + file.filename + "</h3>"

    for _, file in request.files.items():
        start_time = time.time()
        msg = ''

        # get secure filename
        filename = secure_filename(file.filename)

        print(f'Forcing coherent audio format on {filename} ... ', end='')

        if filename[-3:] == 'mp3':
            msg += 'mp3 -> wav'
            filename = filename[:-3:] + 'wav'
            # from_mp3 takes file path or file-like object.
            sound = AudioSegment.from_mp3(file.stream)
        else:
            # read raw wave audio data into AudioSegment object
            sound = AudioSegment(file.read())

        # force sample rate to be coherent
        if sound.frame_rate != SAMPLE_RATE:
            msg += f'{sound.frame_rate}hz -> {SAMPLE_RATE}hz'
            sound = sound.set_frame_rate(SAMPLE_RATE)


        """ Format other audio attribute here """

        # store audio on disc
        sound.export(audios['path'] + filename, format='wav')

        # add file to audios object for use in UI
        duration = len(sound)
        audios['duration'] += duration
        audios['files'].append([filename, duration])
        print(f'done in {time.time()-start_time:.2f} s. {msg}')
    print(f'Saving done in {time.time()-store_time:.2f} s.')
    return audios


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
@app.route('/process_audio', methods=['POST'])
def process_audio() -> str:
    # Check so audio file is included and valid
    if request.method == 'POST':
        # should be checked on client side
        if '0' not in request.files:
            flash('No file part')
            return "<h3>No submitted file. Please go back and choose an audio file.</h3>"
        else:
            # create folder for this session
            sessions = handle_sessions()
            subprocess.call(['mkdir', UPLOAD_FOLDER + sessions['current'][0]])
            print('mkdir ' +  UPLOAD_FOLDER + sessions['current'][0])

            # save all files in folder this sessions folder
            audios = store_audio(request, sessions['current'][0])
            if isinstance(audios, str): return audios

    # parse and format the form data
    settings, features = parse_request(request)

    # process audio according to passed data
    audio_processing.main(sessions, settings, features, audios)

    # pass response with redirect url
    return jsonify(dict(redirect='/' + sessions['current'][0]))

# Triggered when searching by key, if key exists go to load_browser()
@app.route('/retrain', methods=['POST'])
def retrain() -> str:
    print("INSIDE RETRAIN")
    if request.method == 'POST':
        # parse labels
        labels = json.loads(request.form['labels'])

        # parse meta data
        settings, features = parse_request(request)

        # get session tree
        sessions = handle_sessions(request.form['sessions'])

        # audio path and files stored.
        audios = json.loads(request.form['audios'])

        audio_processing.retrain(sessions, settings, features, audios, labels)
        return jsonify(dict(redirect='/' + sessions['current'][0]))
    return ''

# triggered when new set of features are requested
@app.route('/features', methods=['POST'])
def new_features() -> str:
    if request.method == 'POST':
        # parse meta data
        settings, features = parse_request(request)

        # get users current labeling
        labels = None
        if 'labels' in request.form:
            labels = json.loads(request.form['labels'])

        # copy session key and create new key
        sessions = handle_sessions(request.form['sessions'])

        # audio path and files stored.
        audios = json.loads(request.form['audios'])

        # process new features and send user to new plot
        audio_processing.new_features(audios, sessions, settings, features, labels)
        return jsonify(dict(redirect='/' + sessions['current'][0]))
    return ''


# Performs coagulation. Only available when one song has been uploaded!!
@app.route('/coagulate', methods=['POST'])
def run_coagulate() -> str:
    if request.method == 'POST':
        # parse meta data
        settings, features = parse_request(request)

        # copy session key and create new key
        sessions = handle_sessions(request.form['sessions'])

        # audio path and files stored.
        audios = json.loads(request.form['audios'])

        coagulation_data = json.loads(request.form['data'])

        audio_processing.coagulate(audios, sessions, settings, features, coagulation_data)
        return jsonify(dict(redirect='/' + sessions['current'][0]))
    return ''


# Triggered when searching by key, if key exists go to load_browser()
@app.route('/goByKey', methods=['POST'])
def goByKey() -> str:
    if request.method == 'POST':
        session_key = request.form['id']
        data_dir = "static/data/" + session_key + "/"
        if os.path.isdir(data_dir):
            return jsonify(dict(redirect="/"+session_key))
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
                                #audioDuration=data['meta']["audio_duration"],
                                #audioPath="../" + data['meta']["audio_path"],
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
            'settings': data['meta']['settings'],
            'time': data['meta']['sessions']['current']
        })
    else:
        return ''


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


@app.route('/export', methods=['POST'])
def export_to_csv() -> str:
    print('export to csv')
    if request.method == 'POST':
        format = request.form['format']
        data = json.loads(request.form['data'])
        audios = json.loads(request.form['audios'])
        filename = request.form['name']
        _date = str(time.strftime("%x")).replace('/','')
        _time = str(time.strftime("%X")).replace(':','')

        if format == 'csv':
            export = []
            # pack csv data into string
            if '2D' in data[0] and '3D' in data[0]:
                export.append(['x', 'y', 'X', 'Y', 'Z', 'start time (ms)', 'duration (ms)', 'relative start time (ms)', 'audio file name'])
                for point in data:
                    export.append([
                        point['2D']['umap'][0], point['2D']['umap'][1],
                        point['3D']['umap'][0], point['3D']['umap'][1], point['3D']['umap'][2],
                        point['start'] * 1000,  point['length'] * 1000, point['position'] * 1000,
                        audios['files'][point['song_id']][0]
                    ])
            elif '2D' in data[0]:
                export.append(['x', 'y', 'start time (ms)', 'duration (ms)', 'relative start time (ms)', 'audio file name'])
                for point in data:
                    export.append([
                        point['2D']['umap'][0], point['2D']['umap'][1], \
                        point['start'] * 1000,  point['length'] * 1000, point['position'] * 1000, \
                        audios['files'][point['song_id']][0] \
                    ])
            elif '3D' in data[0]:
                export.append(['X', 'Y', 'Z', 'start time (ms)', 'duration (ms)', 'relative start time (ms)', 'audio file name'])
                for point in data:
                    song_name = audios['files'][int(point['song_id'])][0]
                    export.append([
                        str(point['3D']['umap'][0]), str(point['3D']['umap'][1]), str(point['3D']['umap'][2]), \
                        str(point['start'] * 1000),  str(point['length'] * 1000), str(point['position'] * 1000), \
                        str(audios['files'][int(point['song_id'])][0])
                    ])


            si = io.StringIO()
            cw = csv.writer(si)
            cw.writerows(export)
            output = make_response(si.getvalue())
            output.headers["Content-Disposition"] = "attachment; filename=session="+ filename + '_ddmmyy=' + _date + '_hhssmm=' + _time + ".csv"
            output.headers["Content-type"] = 'application/download'
            return output
    return '<h3> error in export to csv </h3>'



if __name__ == '__main__':
    #app.run(debug=True)
    app.run(host='0.0.0.0', debug=True, port=3134)
