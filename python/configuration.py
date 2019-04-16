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
            if line.startswith('FRAMESIZE'):
                line = 'frameSize=' + str(segmentation['segment_size']/1000) + '\n'
            if line.startswith('FRAMESTEP'):
                line = 'frameStep=' + str(segmentation['step_size']/1000) + '\n'
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
                line = 'nMfcc=' + str(mfcc['coefficients']) + '\n'
            f.write(line)
        f.write('\n')

    # handle mfcc delta
    if mfcc['delta'] or mfcc['delta-delta']:
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

        if mfcc['delta-delta']:
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
                line += '1\n' if spectral['flux-centroid'] else '0\n'
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


def write_config(target_path, segmentation, features):
    output = 'reader.dmLevel='

    # Always write header
    _header(target_path, segmentation)

    # check for mfccs
    if 'coefficients' in features['mfccs']:
        output += _mfcc(target_path, features['mfccs'])

    # check for spectrals
    if not features['spectrals']['disabled']:
        output += _spectral(target_path, features['spectrals'])

    if features['signals']['rms']:
        output += _energy(target_path)

    if features['signals']['zcr']:
        output += _zcr(target_path)

    # Always write footer
    _footer(target_path, output)


def _analyze(file):
    csv_file = pandas.read_csv(file, sep=';', float_precision='round_trip')

    data = csv_file.values
    #data = minmax_scale(data, axis=0)
    frames = data.shape[0]
    features = data.shape[1]

    columns = csv_file.columns

    print('----- ANALYSIS -----')
    print(f'n frames: {frames}')
    print(f'n features: {features}')
    print(columns)
    print()


    mean = np.mean(data, axis=0)
    var = np.var(data, axis=0)

    mean_max = np.where(mean == np.amax(mean))
    mean_min = np.where(mean == np.amin(mean))

    var_max = np.where(var == np.amax(var))
    var_min = np.where(var == np.amin(var))

    print()
    print('Mean:', mean)
    print('Mean max:', np.amax(mean), 'feature:', columns[mean_max[0]][0])
    print('Mean min:', np.amin(mean), 'feature:', columns[mean_min[0]][0])
    print('Mean (mean):', np.mean(mean))
    print('Mean (var):', np.var(mean))
    print()
    print('Variance:', var)
    print('Variance max:', np.amax(var), 'feature:', columns[var_max[0]][0])
    print('Variance min:', np.amin(var), 'feature:', columns[var_min[0]][0])
    print('Variance (mean):', np.mean(var))
    print('Variance (var):', np.var(var))



if __name__ == '__main__':
    segmentation = {
        'segment_size': 1.000,
        'step_size': 1.000
    }

    features = {
        'mfccs': {
            'coefficients': 12,
            'delta': True,
            'delta-delta': False
        },
        'spectral': {
            'flux': False,
            'flux-centroid': False,
            'centroid': True,
            'harmonicity': True,
            'flatness': True,
            'rolloff': False}
    }

    test_path = 'configuration/testing/'
    test_config = test_path + 'out.conf'
    test_audio =  test_path + 'test.wav'
    test_csv = test_path + 'test.csv'

    write_config(test_config, segmentation, features)

    subprocess.call(['../opensmile-2.3.0/SMILExtract', "-C", test_config, "-I", test_audio, "-csvoutput", test_csv])
    _analyze(test_csv)
