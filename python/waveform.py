import wave
import subprocess
import json
import os
import numpy
import time
import math
from distutils.dir_util import copy_tree

FOLDER = 'waveform/'


def load_waveform(old_output_dir, new_output_dir, audios, waveform_data):
    waveform_path = f'{new_output_dir}{FOLDER}'
    old_waveform_path = f'{old_output_dir}{FOLDER}'
    copy_tree(old_waveform_path, waveform_path)
    for file in audios['files']:
        with open(f'{waveform_path}{file[0][:-4:]}.json' , 'r') as f:
            d = json.load(f)
            waveform_data['max'] = int(max(max(d['data']), waveform_data['max']))
            waveform_data['min'] = int(min(min(d['data']), waveform_data['min']))
            waveform_data['data'].append(d)


def generate_waveform(output_dir, audio_path, audio_name, waveform_data):
    print(f'Calculating waveform data for {audio_name} ... ', end="")
    start_time = time.time()

    # create waveform data folder if not present
    waveform_folder = f'{output_dir}{FOLDER}'
    if not os.path.isdir(waveform_folder):
        subprocess.call(["mkdir", waveform_folder])

    waveform_path = f'{waveform_folder}{audio_name[:-4:]}.json'

    # TODO: set samples_per_pixel proportional to the total audio duration
    samples_per_pixel = 2000
    with open(os.devnull, 'w') as devnull:
        subprocess.call(['audiowaveform',
                         '-i', audio_path + audio_name,
                         '-o', waveform_path,
                         '-z', str(samples_per_pixel),
                         '-b', '8',
                        ], stdout=devnull)

    with open(waveform_path, 'r') as f:
        d = json.load(f)
        waveform_data['max'] = int(max(max(d['data']), waveform_data['max']))
        waveform_data['min'] = int(min(min(d['data']), waveform_data['min']))
        waveform_data['data'].append(d)

    print(f'done in {time.time()-start_time:.2f} s.')
