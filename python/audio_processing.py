import time
import subprocess
import random
import sys
sys.path.append("../python")
from HTK import HTKFile
import numpy as np
import os
import wave
import contextlib
#from sklearn.manifold import TSNE
from pydub import AudioSegment
import csv
import json
import cluster


smilextract = '../opensmile-2.3.0/SMILExtract'

def update_config(config_file, segment_size, step_size):
    print(config_file)
    with open(config_file, "r", encoding='windows-1252') as f:
        lines = f.readlines()
    with open(config_file, "w", encoding='windows-1252') as f:
        for line in lines:
            frameSize = 0.025
            frameStep = 0.01
            if line.startswith('frameSize'):
                new_line = "frameSize = " + segment_size
                f.write(new_line)
                f.write("\n")
            elif line.startswith('frameStep'):
                new_line = "frameStep = " + step_size + "0"
                f.write(new_line)
                f.write("\n")
            else:
                f.write(line)

def main(session_key, config_file, segment_size, step_size):
    # Get audiofilename
    audio_dir = "static/uploads/" + session_key + "/"
    for file_name in os.listdir(audio_dir):
        if file_name[0] != ".":
            audio_name = file_name
            break
    # Get full path
    audio_path = audio_dir + file_name

    # If mp3, convert to wav
    if audio_path[-3:] == "mp3":
        wav_audio = AudioSegment.from_mp3(audio_path)
        audio_path = audio_path[:-3:] + "wav" # set new audio_path
        wav_audio.export(audio_path, format="wav")

    # Get metadata
    audio_duration = len(AudioSegment.from_wav(audio_path))

    # Create dir for ouput and set filenames
    output_dir = "static/data/" + session_key + "/"
    subprocess.call(["mkdir", output_dir])
    output_path = output_dir + audio_name.split(".")[0] + ".mfcc.htk"

    # Prepend path to config file
    config_file = '../opensmile-2.3.0/config/' + config_file

    # Update config file with segment- and steplength, divided by 1000 to get second-format
    update_config(config_file, str(segment_size/1000), str(step_size/1000))

    # Run opensmile to output features in output dir
    subprocess.call([smilextract, "-C", config_file, "-I", audio_path, "-O", output_path])

    # Read file, and return formatted data
    htk_reader = HTKFile()
    htk_reader.load(output_path)
    result = np.array(htk_reader.data)

    data = []
    for i, _tsne, _pca, _som, _umap in cluster.get_cluster_data(result):
        data.append({
            "id": i,
            "tsne": _tsne.tolist(),
            "pca": _pca.tolist(),
            "som": _som.tolist(),
            "umap": _umap.tolist(),
            "start":int(i*step_size),
            "active": 1,
            "color": "black"
        })

    """ Write data to disk in json format """
    with open(output_dir + "data.json", 'w') as output_file:
        jsonObj = {
            'meta': {
                'audio_duration': audio_duration,
                'audio_path': audio_path,
                'segment_size': segment_size,
                'step_size': step_size
            },
            'data': data,
        }
        json.dump(jsonObj, output_file, separators=(',', ':'))


def retrain(valid_points, session_key, old_session_key, segment_size, step_size):
    # Get audiofilename
    audio_dir = "static/uploads/" + session_key + "/"
    for file_name in os.listdir(audio_dir):
        if file_name[0] != ".":
            audio_name = file_name
            break
    # Get full path
    audio_path = audio_dir + file_name

    # If mp3, convert to wav
    if audio_path[-3:] == "mp3":
        wav_audio = AudioSegment.from_mp3(audio_path)
        audio_path = audio_path[:-3:] + "wav" # set new audio_path
        wav_audio.export(audio_path, format="wav")

    # Get metadata
    audio_duration = len(AudioSegment.from_wav(audio_path))

    # Create dir for ouput and set filenames
    output_dir = "static/data/" + session_key + "/"
    subprocess.call(["mkdir", output_dir])

    # Copy audio
    path_to_old_htk = "static/data/" + old_session_key + "/" + audio_name.split(".")[0] + ".mfcc.htk"
    path_to_new_htk = "static/data/" + session_key + "/" + audio_name.split(".")[0] + ".mfcc.htk"
    subprocess.call(["cp", path_to_old_htk, path_to_new_htk])

    # Read file, and return formatted data
    htk_reader = HTKFile()
    htk_reader.load(path_to_old_htk)
    result = np.array(htk_reader.data)
    new_result = []

    valid_points_indexes = [i[0] for i in valid_points[1:]]
    start_times = [i[1] for i in valid_points[1:]]
    colors = [i[2] for i in valid_points[1:]]
    for i, line in enumerate(result):
        if i in valid_points_indexes:
            new_result.append(line)

    new_result = np.array(new_result)

    data = []
    for i, _tsne, _pca, _som, _umap in cluster.get_cluster_data(new_result):
        data.append({
            "id": i,
            "tsne": _tsne.tolist(),
            "pca": _pca.tolist(),
            "som": _som.tolist(),
            "umap": _umap.tolist(),
            "start":int(i*step_size),
            "active": 1,
            "color": "black"
        })

    """ Write data to disk in json format """
    with open(output_dir + "data.json", 'w') as output_file:
        jsonObj = {
            'meta': {
                'audio_duration': audio_duration,
                'audio_path': audio_path,
                'segment_size': segment_size,
                'step_size': step_size
            },
            'data': data,
        }
        json.dump(jsonObj, output_file, separators=(',', ':'))
