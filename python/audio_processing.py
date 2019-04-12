import time
import subprocess
import random
import sys
sys.path.append("../python")
import configuration
import waveform
import numpy as np
import os
import wave
import contextlib
#from sklearn.manifold import TSNE
from pydub import AudioSegment
import pandas
import json
import cluster
from sklearn.preprocessing import minmax_scale, normalize

smilextract = '../opensmile-2.3.0/SMILExtract'
MASTER_CONF = 'ANALYSIS.conf'



def csv_to_data(filename):
    csv_file = pandas.read_csv(filename, sep=';', header=1, float_precision='round_trip')
    return minmax_scale(csv_file.values, axis=0)

def main(session_key, settings, features):

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

    # configure openSMILE file names
    output_path = output_dir + audio_name.split(".")[0] + ".csv"
    config_path = output_dir +'config.conf'

    # create config file in session dir
    configuration.write_config(config_path, settings, features)

    # Run openSMILE to output features in output dir
    subprocess.call([smilextract, "-C", config_path, "-I", audio_path, "-csvoutput", output_path])

    # Read file, and return formatted data
    result = csv_to_data(output_path)
    n_points = result.shape[0]
    waveform_data = None

    # construct wavedata
    waveform_data = waveform.getJson(output_dir, audio_path, settings['step_size'], n_points)

    # start clustering for each component
    data = []
    first = True
    for c in settings['components']:
        result = cluster.run(result, c, settings['n_neighbours'], settings['metric'])
        for idx, row in enumerate(result):
            # if this is the first of two components
            if first:
                data.append({
                    'id': idx,
                    f'{c}D': {
                        'umap': row.tolist()
                        # tsne, som, pca also valid
                    },
                    'start': int(idx*settings['step_size']),
                    'active': 1,
                    'category': 'black'
                })
            else:
                # add other component data to each object
                data[idx][f'{c}D'] = {
                    'umap': row.tolist()
                    # tsne, som, pca also valid
                }
        first = False;

    pack_and_store_data(output_dir, data, waveform_data, audio_duration, audio_path, settings)



def retrain(valid_points, session_key, old_session_key, settings):
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


    # Copy csv files
    path_to_old_csv = "static/data/" + old_session_key + "/" + audio_name.split(".")[0] + ".csv"
    path_to_new_csv = "static/data/" + session_key + "/" + audio_name.split(".")[0] + ".csv"
    subprocess.call(["cp", path_to_old_csv, path_to_new_csv])

    # read in old csv file
    result = csv_to_data(path_to_old_csv)

    # parse data from labeled points
    idxs =   [i[0] for i in valid_points[1:]]
    starts = [i[1] for i in valid_points[1:]]
    colors = [i[2] for i in valid_points[1:]]
    new_result = []
    for i in range(result.shape[0]):
        if i in idxs:
            new_result.append(result[i,:])
    new_result = np.array(new_result)

    # get old waveform data
    waveform_data = waveform.getJson(output_dir, audio_path, settings['step_size'], starts[-1] / settings['step_size'])

    # start clustering for each component
    data = []
    first = True
    for c in settings['components']:
        result = cluster.run(new_result, c, settings['n_neighbours'], settings['metric'])
        for idx, row in enumerate(result):
            # if this is the first of two components
            if first:
                data.append({
                    'id': idx,
                    f'{c}D': {
                        'umap': row.tolist()
                        # tsne, som, pca also valid
                    },
                    'start': starts[idx],
                    'active': 1,
                    'category': colors[idx]
                })
            else:
                # add other component data to each object
                data[idx][f'{c}D'] = {
                    'umap': row.tolist()
                    # tsne, som, pca also valid
                }
        first = False;

    pack_and_store_data(output_dir, data, waveform_data, audio_duration, audio_path, settings)



def pack_and_store_data(output_dir, data, waveform_data, audio_duration, audio_path, settings):
    # Write data to disk in json format
    with open(output_dir + "data.json", 'w') as output_file:
        jsonObj = {
            'meta': {
                'audio_duration': audio_duration,
                'audio_path': audio_path,
                'segment_size': settings['segment_size'],
                'step_size': settings['step_size'],
                'waveform': waveform_data,
                'n_neighbours': settings['n_neighbours'],
                'components': settings['components'],
                'metric': settings['metric'],
                'n_songs': settings['n_songs']
            },
            'data': data,
        }
        json.dump(jsonObj, output_file, separators=(',', ':'))
