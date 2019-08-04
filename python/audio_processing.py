import time
import subprocess
import random
import sys
sys.path.append("../python")
import configuration
import coagulation
import waveform
import numpy as np
import os
import wave
import contextlib
#from sklearn.manifold import TSNE
from pydub import AudioSegment
import pandas
import json
import itertools
import cluster
from sklearn.preprocessing import minmax_scale, normalize, scale

smilextract = '../opensmile-2.3.0/SMILExtract'
MASTER_CONF = 'ANALYSIS.conf'


FEATURES = 'features.csv'
CONFIG = 'config.conf'

SAMPLE_RATE = 44100


def main(sessions, settings, features, audios):
    # Set directory variables and create output data directory
    output_dir = 'static/data/' + sessions['current'][0] + '/'

    # create directory
    subprocess.call(["mkdir", output_dir])

    # Hanlde audio files. Catalog, configure opensmile, extract features, do waveform
    waveform_data = extract_features_and_waveform(output_dir, settings, features, audios)

    # get resulting data
    data = csv_to_data(output_dir)

    # cluster data
    data = cluster_data(output_dir, data, settings)

    # pack data for application
    data = pack_data(data, settings)

    # save data and meta data to disc
    store_data(output_dir, data, waveform_data, audios, settings, features, sessions)


def retrain(sessions, settings, features, audios, labels=None):
    # Create new dir for session ouput
    output_dir = "static/data/" + sessions['current'][0] + "/"
    old_output_dir = "static/data/" + sessions['previous'][0][0] + "/"
    subprocess.call(["mkdir", output_dir])

    # Copy csv files
    path_to_new_csv = output_dir + FEATURES
    path_to_old_csv = old_output_dir + FEATURES
    subprocess.call(["cp", path_to_old_csv, path_to_new_csv])

    # read in old csv file
    result = csv_to_data(output_dir)


    # OBVIOUSLY OPTIMIZE THIS
    idxs     = [i[0] for i in labels['data'][1:]]
    starts   = [i[1] for i in labels['data'][1:]]
    targets  = [i[2] for i in labels['data'][1:]]
    song_ids = [i[3] for i in labels['data'][1:]]
    positions= [i[4] for i in labels['data'][1:]]
    lengths  = [i[5] for i in labels['data'][1:]]
    data = []
    for i in idxs:
        data.append(result[i,:])
    data = np.array(data)

    # get old waveform data (TODO: load from ui by request)
    waveform_data = {
        'min': 99999999,
        'max':-99999999,
        'data': []
    }
    waveform.load_waveform(old_output_dir, output_dir, audios, waveform_data)

    if labels['supervised']:
        data = cluster_data(output_dir, data, settings, target_data=targets)
    else:
        data = cluster_data(output_dir, data, settings)

    # pack data with data passed from UI
    data = pack_data(data, settings, labels=targets,
                                     starts=starts,
                                     positions=positions,
                                     song_ids=song_ids,
                                     lengths=lengths)

    store_data(output_dir, data, waveform_data, audios, settings, features, sessions)


def new_features(audios, sessions, settings, features, labels=None):
    # Create new dir for session ouput
    output_dir = "static/data/" + sessions['current'][0] + "/"
    subprocess.call(["mkdir", output_dir])

    # Hanlde audio files. Catalog, configure opensmile, extract features, do waveform
    waveform_data = extract_features_and_waveform(output_dir, settings, features, audios)

    # copy old waveform data and import (SHOULD BE POSSIBLE)
    # old_waveform_path = "static/data/" + sessions['previous'][0][0] + "/wavedata.json"
    # new_waveform_path = "static/data/" + sessions['current'][0] + "/wavedata.json"
    # subprocess.call(['cp', old_waveform_path, new_waveform_path])
    # waveform_data = waveform.getComputedJson(new_waveform_path)

    # get resulting data
    data = csv_to_data(output_dir)

    if labels and len(labels) != data.shape[0]:
        labels = None

    # cluster data (TODO: let user use labels to cluster semi/full-supervised clustering)
    data = cluster_data(output_dir, data, settings)

    # pack data for application with passed labels
    data = pack_data(data, settings, labels=labels)

    store_data(output_dir, data, waveform_data, audios, settings, features, sessions)



def coagulate(audios, sessions, settings, features, coagulation_data):
    # Create dir for ouput and set filenames
    output_dir = "static/data/" + sessions['current'][0] + "/"
    old_output_dir = "static/data/" + sessions['previous'][0][0] + "/"
    subprocess.call(["mkdir", output_dir])

    # load previous raw cluster data
    target_component = settings['segmentation']['target']
    X = np.load("static/data/" + sessions['previous'][0][0] + f'/{target_component}.npy');

    # Copy csv files
    path_to_new_csv = output_dir + FEATURES
    path_to_old_csv = old_output_dir + FEATURES
    subprocess.call(["cp", path_to_old_csv, path_to_new_csv])

    # read in old csv file
    feature_data = csv_to_data(output_dir)

    # coagulate segments
    X, mapping = coagulation.run(X, coagulation_data, feature_data, settings)

    # store coagulated data
    overwrite_csv_with_data(output_dir, X)

    # get old waveform data (TODO: load from ui by request)
    waveform_data = {
        'min': 99999999,
        'max':-99999999,
        'data': []
    }
    waveform.load_waveform(old_output_dir, output_dir, audios, waveform_data)

    # cluster on coagulated data
    data = cluster_data(output_dir, X, settings)

    # pack coagulation data with passed data (OBVIOSULY OPTIMIZE THIS)
    starts   = [i[0] for i in mapping]
    lengths  = [i[1] for i in mapping]
    song_ids = [i[2] for i in mapping]
    positions= [i[3] for i in mapping]
    labels   = [i[4] for i in mapping]
    data = pack_data(data, settings, starts=starts,
                                     lengths=lengths,
                                     positions=positions,
                                     song_ids=song_ids,
                                     labels=labels)


    # store application data
    store_data(output_dir, data, waveform_data, audios, settings, features, sessions)


''' --- HELPER METHODS BELOW --- '''

def get_rows_in_csv(filename):
    with open(filename, 'r') as f:
        row_count = sum(1 for row in f) - 1 # never count header line or last empty line
    return row_count

def csv_to_data(output_dir):
    csv_file = pandas.read_csv(f'{output_dir}' + FEATURES, sep=';', header=0, float_precision='round_trip')
    return scale(X=csv_file.values, axis=0)

def overwrite_csv_with_data(output_dir, data):
    # read only header from previous csv file
    csv_file = pandas.read_csv(f'{output_dir}' + FEATURES, sep=';').columns.to_list()
    np.savetxt(f'{output_dir}' + FEATURES, data, delimiter=';', header=';'.join(csv_file), comments='')
    # create dataframe with header and data
    #df = pandas.DataFrame(data=data, columns=csv_header)
    # store on disc
    #df.to_csv(f'{output_dir}' + FEATURES, header=True, sep=';', index=False)


"""
Extract features and waveform data.

Configures config file for openSMILE from settings and features parameters.
Runs openSMILE and extracts feature data. Creates and appends csv data to one single file.

:param str  output_dir: target output directory
:param dict settings: cluster and segmentation settings
:param dict features: selected feature set
:param dict audios: audio path and files
:param str  config_path: path to old config file, defaults to None.
:param bool compute_waveform: defaults to True
"""
def extract_features_and_waveform(output_dir, settings, features, audios, config_path=None, compute_waveform=True):
    # setup paths
    feature_path = output_dir + FEATURES
    config_path = output_dir + CONFIG if config_path == None else config_path

    # create config file in session dir
    configuration.write_config(config_path, settings, features)

    # track number of data points for unique coloring and
    # for processing correct waveform data
    windows = []
    waveform_data = {
        'min': 99999999,
        'max':-99999999,
        'data': []
    }

    for file in audios['files']:
        # call opensmile on the current file and calculate number of windows
        subprocess.call([smilextract, '-C', config_path, '-I', audios['path'] + file[0], '-O', feature_path, '-append', str(1)])

        # get number of data points for each song
        windows.append(get_rows_in_csv(feature_path))

        if compute_waveform:
            # passes waveform_data and modifies it in pass-by-reference fashion
            # n_windows = windows[-1] if len(windows) == 1 else windows[-1] - windows[-2]
            waveform.generate_waveform(output_dir, audios['path'], file[0], waveform_data)

    # append final point count to segmentation object
    settings['segmentation']['windows'] = windows

    # return audios object
    return waveform_data



"""
Cluster data using UMAP. Takes optional target data
for full-/semi-supervised clustering. Stores results
on disc for use in coagulation and concat.

Ensure target_data has same length as csv_data!!!

:param str output_dir:
:param np.array csv_data: feature data
:param dict settings:
:param list target_data: labels for clustering. -1 = no labels. Defaults to None.
"""
def cluster_data(output_dir, csv_data, settings, target_data=None):
    result = {}
    for c in settings['cluster']['components']:
        r = cluster.run(X=csv_data, Y=target_data,
                             n_components=c,
                             n_neighbors=settings['cluster']['neighbours'],
                             metric=settings['cluster']['metric'])
        # store results for coagulation
        np.save(f'{output_dir}{c}', r)
        # result object
        result[c] = r
    return result



"""
Cluster and packs result for UI. All parameters defaulting to None
should be list of exact same length as number of rows in X!!

Packed data : [
    {
        3D: {umap: [x,y,z]},
        2D: {umap: [x,y,z]},
        category: <int>, 0 to 8
        id: <int>, 0 to n data points
        length: <int>, length of segment in seconds
        start: <int>, start time in secionds,
        song_id: <int>, song index from 0 to m songs,
        position: <int>, absolute time relative to all songs in secionds
    },
    .
    .
    .
]

:param str output_dir:
:param numpy.ndarray X: normalized feature data, shape=[n segments, features]
:param dict settings: settings meta data
:param list labels: custom labels from previous session,
                    must have same number of rows as X, defaults to None
:param list starts: custom starting points in seconds,
                    must have same number of rows as X, defaults to None
:param list positions: custom absolute positions in seconds,
                       must have same number of rows as X, defaults to None
:param list lengths: custom segment lengths in seconds,
                     must have same number of rows as X, defaults to None
:param list songs_ids: custom song ids, must have same number
                       of rows as in X, defaults to None
:param bool use_supervised: set UMAP with target labels,
                            ensure same number of rows as X, defaults to None

"""
def pack_data(cluster_data, settings, labels=None,
                            starts=None,  positions=None,
                            lengths=None, song_ids=None):
    # start clustering for each component
    data = []
    first = True
    for c in settings['cluster']['components']:
        song_id = 0
        relative_idx = 0
        for idx, row in enumerate(cluster_data[c]):
            # update song id from windows
            if 'windows' in settings['segmentation']:
                if idx > settings['segmentation']['windows'][song_id] - 1:
                    song_id += 1
                    relative_idx = 0

            # if this is the first of two components
            if first:
                data.append({
                    'id': idx,
                    'song_id': song_id if not song_ids else song_ids[idx],
                    f'{c}D': {
                        'umap': row.tolist()
                    },
                    #'start': int(relative_idx*settings['segmentation']['step']) if not starts else starts[idx],
                    'start': (relative_idx * settings['segmentation']['step']) / 1000 if not starts else starts[idx],
                    'position': (idx * settings['segmentation']['step']) / 1000 if not positions else positions[idx],
                    #'length': int(settings['segmentation']['size']),
                    'length': settings['segmentation']['size'] / 1000 if not lengths else lengths[idx],
                    'category': 0 if not labels or labels[idx] == -1 else labels[idx]
                })
            else:
                # add other component data to each object
                data[idx][f'{c}D'] = {
                    'umap': row.tolist()
                }
            relative_idx += 1
        first = False;
    print('done')
    return data

def store_data(output_dir, data, waveform_data, audios, settings, features, sessions):
    # Write data to disk in json format
    with open(output_dir + "data.json", 'w') as output_file:
        jsonObj = {
            'meta': {
                'audios': audios,
                'waveform': waveform_data,
                'features': features,
                'settings': settings,
                'sessions': sessions
            },
            'data': data,
        }
        json.dump(jsonObj, output_file, separators=(',', ':'))
