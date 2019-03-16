import time
import subprocess
import random
import sys
sys.path.append("../python")
import configuration
from HTK import HTKFile
import numpy as np
import os
import wave
import contextlib
#from sklearn.manifold import TSNE
from pydub import AudioSegment
import pandas
import json
import cluster
from sklearn.preprocessing import minmax_scale

smilextract = '../opensmile-2.3.0/SMILExtract'
MASTER_CONF = 'ANALYSIS.conf'



def csv_to_data(filename):
    csv_file = pandas.read_csv(filename, sep=';', header=1, float_precision='round_trip')
    return minmax_scale(csv_file.values, axis=0)

def main(session_key, segmentation, components, features):

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

    # compute feature vectors for all segmentations
    for name, settings in segmentation.items():
        output_path = output_dir + name + '_' + audio_name.split(".")[0] + ".csv"
        config_path = output_dir + name + '_' + 'config.conf'

        # create config file in session dir
        configuration.write_config(config_path, settings, features)

        # Run opensmile to output features in output dir
        subprocess.call([smilextract, "-C", config_path, "-I", audio_path, "-csvoutput", output_path])
        segmentation[name]['path'] = output_path

    # compute all clusters given number of components and data
    for name, seg in segmentation.items():
        print(seg)
        # Read file, and return formatted data
        result = csv_to_data(seg['path'])
        cluster_data = {}
        for c in components:
            cluster_data[f'{c}D'] = cluster.get_cluster_data(result, c)


        data = []
        #for i, _tsne, _pca, _som, _umap in cluster_data['3D']:
        for i, _tsne, _pca, _umap in cluster_data['3D']:
            data.append({
                'id': i,
                '3D': {
                    "tsne": _tsne.tolist(),
                    "pca": _pca.tolist(),
                    #"som": _som.tolist(),
                    "umap": _umap.tolist(),
                },
                'start': int(i*seg['step']),
                'active': 1,
                'category': 'black'
            })

        if '2D' in cluster_data:
            #for i, _tsne, _pca, _som, _umap in cluster_data['2D']:
            for i, _tsne, _pca, _umap in cluster_data['2D']:
                data[i]['2D'] = {
                    "tsne": _tsne.tolist(),
                    "pca": _pca.tolist(),
                    #"som": _som.tolist(),
                    "umap": _umap.tolist(),
                }

        # Write data to disk in json format
        with open(output_dir + f'{name}_' + "data.json", 'w') as output_file:
            jsonObj = {
                'meta': {
                    'audio_duration': audio_duration,
                    'audio_path': audio_path,
                    'segment_size': seg['size'],
                    'step_size': seg['step']
                },
                'data': data,
            }
            json.dump(jsonObj, output_file, separators=(',', ':'))


def retrain(valid_points, session_key, old_session_key, segmentation):
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
    path_to_old_htk = "static/data/" + old_session_key + "/" + audio_name.split(".")[0] + ".csv"
    path_to_new_htk = "static/data/" + session_key + "/" + audio_name.split(".")[0] + ".csv"
    subprocess.call(["cp", path_to_old_htk, path_to_new_htk])

    # Read file, and return formatted data
    result = csv_to_data(path_to_old_htk)
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
            "start": int(i*segmentation['size']),
            "active": 1,
            "category": "black"
        })

    # Write data to disk in json format
    with open(output_dir + "data.json", 'w') as output_file:
        jsonObj = {
            'meta': {
                'audio_duration': audio_duration,
                'audio_path': audio_path,
                'segment_size': segmentation['size'],
                'step_size': segmentation['step']
            },
            'data': data,
        }
        json.dump(jsonObj, output_file, separators=(',', ':'))
