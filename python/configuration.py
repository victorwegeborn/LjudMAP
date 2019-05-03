import subprocess
import pandas
import numpy as np
import sys
from sklearn.preprocessing import minmax_scale
import os
script_dir = os.path.dirname(__file__)

np.set_printoptions(threshold=np.nan)


def _header(target_path, segmentation):
    file_path = os.path.join(script_dir, 'configuration/header.conf')
    config = []
    with open(file_path, 'r') as f:
        for line in f:
            config.append(line)

    with open(target_path, 'w') as f:
        for line in config:
            if segmentation['mode'] == 'uniform':
                if line.startswith(';FRAMESIZE'):
                    line = 'frameSize=' + str(segmentation['size']/1000) + '\n'
                if line.startswith(';FRAMESTEP'):
                    line = 'frameStep=' + str(segmentation['step']/1000) + '\n'
                if line.startswith(';MODE'):
                    line = 'frameMode=fixed\n'
            elif segmentation['mode'] == 'coagulated':
                if line.startswith(';FRAMESIZE'):
                    line = 'frameSize=0\n'
                if line.startswith(';FRAMESTEP'):
                    line = 'frameStep=0\n'
                if line.startswith(';MODE'):
                    line = 'frameMode = full\n'
            f.write(line)
        f.write('\n')

def _footer(target_path, output_string):
    file_path = os.path.join(script_dir, 'configuration/footer.conf')
    config = []
    with open(file_path, 'r') as f:
        for line in f:
            config.append(line)

    with open(target_path, 'a') as f:
        for line in config:
            if line.startswith('OUTPUT'):
                line = output_string + '\n'
            f.write(line)
        f.write('\n')

def _mfcc(target_path, mfcc):
    file_path = os.path.join(script_dir, 'configuration/mfcc.conf')
    config = []
    local_output = 'mfcc;'
    with open(file_path, 'r') as f:
        for line in f:
            config.append(line)

    with open(target_path, 'a') as f:
        for line in config:
            if line.startswith('COEFFICIENT'):
                line = 'lastMfcc=' + str(mfcc['coefficients']) + '\n'
            f.write(line)
        f.write('\n')

    # handle mfcc delta
    if mfcc['delta'] or mfcc['deltadelta']:
        delta_path = os.path.join(script_dir, 'configuration/delta.conf')
        deltadelta_path = os.path.join(script_dir, 'configuration/deltadelta.conf')
        delta = []
        deltadelta = []
        with open(delta_path, 'r') as f:
            for line in f:
                delta.append(line)

        if mfcc['delta']:
            with open(target_path, 'a') as f:
                for line in delta:
                    f.write(line)
                f.write(line)
            local_output += 'mfccD;'

        if mfcc['deltadelta']:
            with open(deltadelta_path, 'r') as f:
                for line in f:
                    deltadelta.append(line)

            if not mfcc['delta']:
                with open(target_path, 'a') as f:
                    for line in delta:
                        f.write(line)
                    f.write(line)

            with open(target_path, 'a') as f:
                for line in deltadelta:
                    f.write(line)
                f.write(line)
                local_output += 'mfccDD;'

    return local_output


def _spectral(target_path, spectral):
    file_path = os.path.join(script_dir, 'configuration/spectral.conf')
    config = []
    with open(file_path, 'r') as f:
        for line in f:
            config.append(line)

    with open(target_path, 'a') as f:
        for line in config:
            if line == 'FLUX\n':
                line = 'flux='
                line += '1\n' if spectral['flux'] else '0\n'
            if line == 'FLUXCENTROID\n':
                line = 'fluxCentroid='
                line += '1\n' if spectral['fluxcentroid'] else '0\n'
            if line == 'CENTROID\n':
                line = 'centroid='
                line += '1\n' if spectral['centroid'] else '0\n'
            if line == 'HARMONICITY\n':
                line = 'harmonicity='
                line += '1\n' if spectral['harmonicity'] else '0\n'
            if line == 'FLATNESS\n':
                line = 'flatness='
                line += '1\n' if spectral['flatness'] else '0\n'
            #if line == 'ROLLOFF\n':
            #    line = 'rolloff[0]=0.8\n' if spectral['rolloff'] else ''
            if line == 'ROLLOFF\n':
                line = ''
            if line == 'SLOPE\n':
                line = 'slope='
                line += '1\n' if spectral['slope'] else '0\n'
            f.write(line)
        f.write('\n')
    return 'spec;'


def _energy(target_path):
    file_path = os.path.join(script_dir, 'configuration/energy.conf')
    config = []
    with open(file_path, 'r') as f:
        for line in f:
            config.append(line)

    with open(target_path, 'a') as f:
        for line in config:
            ''' add input variables here '''
            f.write(line)
        f.write('\n')
    return 'energy;'


def _zcr(target_path):
    file_path = os.path.join(script_dir, 'configuration/zcr.conf')
    config = []
    with open(file_path, 'r') as f:
        for line in f:
            config.append(line)


    with open(target_path, 'a') as f:
        for line in config:
            ''' add input variables here '''
            f.write(line)
        f.write('\n')
    return 'mzcr;'


def write_config(target_path, settings, features):
    output = 'reader.dmLevel='

    # Always write header
    _header(target_path, settings['segmentation'])

    # check for mfccs
    if not features['mfccs']['disabled']:
        output += _mfcc(target_path, features['mfccs'])

    # check for spectrals
    if not features['spectrals']['disabled'] and True in features['spectrals'].values():
        output += _spectral(target_path, features['spectrals'])

    if not features['signals']['disabled'] and True in features['signals'].values():
        if features['signals']['rms']:
            output += _energy(target_path)

        if features['signals']['zcr']:
            output += _zcr(target_path)

    # Always write footer
    _footer(target_path, output)




if __name__ == '__main__':
    test_path = 'configuration/testing/'
    test_config = test_path + 'test.conf'
    test_audio =  test_path + 'test.wav'
    test_list = test_path + 'list.txt'
    test_csv = test_path + 'test.csv'
    subprocess.call(['../opensmile-2.3.0/SMILExtract', "-loglevel", "9", "-C", test_config, "-L", test_list, "-I", test_audio, "-csvoutput", test_csv])
