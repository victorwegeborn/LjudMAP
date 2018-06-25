# -*- coding: utf-8 -*-
import os

from flask import Flask, render_template, request, flash, redirect, url_for
from werkzeug.utils import secure_filename
import subprocess
import sys
sys.path.append("../python")
sys.path.append("..")
import audio2spec
import spec2map
import time

UPLOAD_FOLDER = 'uploads/'
ALLOWED_EXTENSIONS = set(['wav'])

app = Flask(__name__)
app.secret_key = 'hejhej00'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def upload_file():
    #subprocess.call('rm /uploads/*', shell=True)
    return render_template('index.html')

@app.route('/visualizer', methods=['POST'])
def visualizer() -> str:
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
                subprocess.call('mkdir uploads/' + session_key, shell=True)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], session_key + "/" + filename))
                print(file.filename + " saved")
            else:
                print("File extension not allowed")
                return "<h3>File extension not allowed. Please use WAV, one channel.</h3>"
    
    algorithm = request.form['radio1']
    dimensionality = request.form['radio2']
    segment_size = request.form['radio3']
    features = request.form['radio4']
    
    pix_per_sec = {"25":"4000", "50":"2000", "100":"1000", "250":"400", "500":"200", "1000":"100"}
    audio2spec.main(pix_per_sec[segment_size], str(65), segment_size, "uploads/" + session_key, "static/data/" + session_key, manual_segment=False)
    cluster = spec2map.Cluster()
    spec_path, sound_path = "static/data/" + session_key + "/spectrograms/", "static/data/" + session_key + "/sounds/"
    cluster.train_tsne(spec_path, sound_path, 100)
    
    return render_template('visualizer.html', path="static/data/" + session_key, session_key=session_key)

@app.route('/visualizebykey', methods=['POST'])
def visualize_by_key() -> str:
    if request.method == 'POST':
        session_key = request.form['sessionKey']
        if os.path.isdir('static/data/' + session_key):
            return render_template('visualizer.html', path="static/data/" + session_key, session_key=session_key) 
        else:
            return "<h3>Not a valid key.</h3>"


if __name__ == '__main__':
    #app.run(debug=True)
    app.run(host='0.0.0.0', debug=True, port=3134)

