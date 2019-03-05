

_FRAMESIZE = 1
_FRAMESTEP = 2

_COEFFICIENTS = 9

_FLUX = 3
_FLUXCENTROID = 4
_CENTROID = 5
_HARMONICITY = 6
_FLATNESS = 7
_ROLLOFF = 8

_OUTPUT = 10

BASE = ['[componentInstances:cComponentManager]',
        'instance[dataMemory].type=cDataMemory',
        '',
        'instance[waveIn].type=cWaveSource',
        '',
        '[waveIn:cWaveSource]',
        'writer.dmLevel=wave',
        'buffersize_sec = 5.0',
        'filename=\\cm[inputfile(I){test.wav}:name of input file]',
        'start=\\cm[start{0}:audio start position in seconds]',
        'end=\\cm[end{-1}:audio end position in seconds, -1 for end of file]',
        'monoMixdown=1',
        'outFieldName = pcm',
        '',
        '[componentInstances:cComponentManager]',
        'instance[frame].type=cFramer',
        'instance[win].type=cWindower',
        'instance[fft].type=cTransformFFT',
        'instance[fftmag].type=cFFTmagphase',
        'instance[melspec].type=cMelspec',
        '',
        'nThreads=1',
        'printLevelStats=0',
        '',
        '[frame:cFramer]',
        'reader.dmLevel=wave',
        'writer.dmLevel=frames',
        'noPostEOIprocessing = 1',
        'copyInputName = 1',
        _FRAMESIZE,
        _FRAMESTEP,
        'frameMode = fixed',
        'frameCenterSpecial = left',
        '',
        '[win:cWindower]',
        'reader.dmLevel=frames',
        'writer.dmLevel=winframes',
        'copyInputName = 1',
        'processArrayFields = 1',
        'winFunc = ham',
        'gain = 1.0',
        'offset = 0',
        '',
        '[fft:cTransformFFT]',
        'reader.dmLevel=winframes',
        'writer.dmLevel=fft',
        'copyInputName = 1',
        'processArrayFields = 1',
        'inverse = 0',
        'zeroPadSymmetric = 0',
        '',
        '[fftmag:cFFTmagphase]',
        'reader.dmLevel=fft',
        'writer.dmLevel=fftmag',
        'copyInputName = 1',
        'processArrayFields = 1',
        'inverse = 0',
        'magnitude = 1',
        'phase = 0',
        '',
        '[melspec:cMelspec]',
        'reader.dmLevel=fftmag',
        'writer.dmLevel=melspec',
        'copyInputName = 1',
        'processArrayFields = 1',
        'nBands = 26',
        'usePower = 1',
        'lofreq = 0',
        'hifreq = 16000',
        'specScale = mel',
        'inverse = 0',
        '']

MFCC = ['[componentInstances:cComponentManager]',
        'instance[mfcc].type=cMfcc',
        '',
        '[mfcc:cMfcc]',
        'reader.dmLevel=melspec',
        'writer.dmLevel=mfcc',
        'copyInputName = 1',
        'processArrayFields = 1',
        'firstMfcc = 1',
        _COEFFICIENTS,
        'cepLifter = 22.0',
        'htkcompatible = 1',
        '',]

DELTA =['[componentInstances:cComponentManager]',
        'instance[energy].type=cEnergy',
        'instance[cat].type=cVectorConcat',
        'instance[delta].type=cDeltaRegression',
        '',
        '[energy:cEnergy]',
        'reader.dmLevel=frames',
        'writer.dmLevel=energy',
        'nameAppend = energy',
        'copyInputName = 1',
        'processArrayFields = 0',
        'htkcompatible=1',
        'rms = 0',
        'log = 1',
        '',
        '[cat:cVectorConcat]',
        'reader.dmLevel=mfcc;energy',
        'writer.dmLevel=ft0',
        'copyInputName = 1',
        'processArrayFields = 0',
        '',
        '[delta:cDeltaRegression]',
        'reader.dmLevel=ft0',
        'writer.dmLevel=ft0de',
        'nameAppend = de',
        'copyInputName = 1',
        'noPostEOIprocessing = 0',
        'deltawin=2',
        'blocksize=1',
        '']

ACCEL =['[componentInstances:cComponentManager]',
        'instance[accel].type=cDeltaRegression',
        '',
        '[accel:cDeltaRegression]',
        'reader.dmLevel=ft0de',
        'writer.dmLevel=ft0dede',
        'nameAppend = de',
        'copyInputName = 1',
        'noPostEOIprocessing = 0',
        'deltawin=2',
        'blocksize=1',
        '']

SPEC = ['[componentInstances:cComponentManager]',
        'instance[spectral].type=cSpectral',
        '',
        '[spectral:cSpectral]',
        'reader.dmLevel=melspec',
        'writer.dmLevel=spec',
        'processArrayFields=1',
        _FLUX, # flux=0
        _FLUXCENTROID, # fluxCentroid=0,
        _CENTROID, # centroid=0
        _HARMONICITY, # harmonicity=0
        _FLATNESS, # flatness=0
        _ROLLOFF, # rollOff=0.8 domain [0,1]
        ';bands=0-250;250-4000;4000-16000',
        'normBandEnergies=1',
        '']

OUT  = ['[componentInstances:cComponentManager]',
        'instance[audspec_lldconcat].type=cVectorConcat',
        'instance[lldcsvsink].type=cCsvSink',
        '',
        '[audspec_lldconcat:cVectorConcat]',
        _OUTPUT,
        'writer.dmLevel = lld',
        'includeSingleElementFields = 1',
        '',
        '[lldcsvsink:cCsvSink]',
        'reader.dmLevel = lld',
        'filename=\\cm[csvoutput{?}:output csv file for LLD, disabled by default ?, only written if filename given]',
        'append = 0',
        'timestamp = 0',
        'number = 0',
        'printHeader = 1',
        'errorOnNoOutput = 1',
        '']





def write_config(filepath, segmentation, features):
    READER_STRING = 'reader.dmLevel = '
    with open(filepath, 'w') as f:
        for row in BASE:
            if isinstance(row, int):
                if row == _FRAMESIZE: row = 'frameSize = ' + str(segmentation['size']/1000)
                if row == _FRAMESTEP: row = 'frameStep = ' + str(segmentation['step']/1000)
            f.write(row)
            f.write('\n')
        if 'MFCC' in features:
            for row in MFCC:
                if row == _COEFFICIENTS: row = 'lastMfcc=' + str(features['MFCC']['coefficients'])
                f.write(row)
                f.write('\n')
            if features['MFCC']['delta']:
                for row in DELTA:
                    f.write(row)
                    f.write('\n')
                READER_STRING += 'ft0;ft0de;'
            if features['MFCC']['deltadelta']:
                if not features['MFCC']['delta']:
                    for row in DELTA:
                        f.write(row)
                        f.write('\n')
                for row in ACCEL:
                    f.write(row)
                    f.write('\n')
                READER_STRING += 'ft0dede;'
            else:
                READER_STRING += 'mfcc;'
        if 'SPECTRAL' in features:
            for row in SPEC:
                if isinstance(row, int):
                    if row == _FLUX: row = 'flux=1' if features['SPECTRAL']['flux'] else 'flux=0'
                    if row == _FLUXCENTROID: row = 'fluxCentroid=1' if features['SPECTRAL']['fluxCentroid'] else 'fluxCentroid=0'
                    if row == _CENTROID: row = 'centroid=1' if features['SPECTRAL']['centroid'] else 'centroid=0'
                    if row == _HARMONICITY: row = 'harmonicity=1' if features['SPECTRAL']['harmonicity'] else 'harmonicity=0'
                    if row == _FLATNESS: row = 'flatness=1' if features['SPECTRAL']['flatness'] else 'flatness=0'
                    if row == _ROLLOFF: row = 'rollOff=0.8' if features['SPECTRAL']['rolloff'] else ''
                f.write(row)
                f.write('\n')
            READER_STRING += 'spec;'
        for row in OUT:
            if row == _OUTPUT:
                row = READER_STRING
            f.write(row)
            f.write('\n')


if __name__ == '__main__':
    segmentation = {'size': 1.000, 'step': 1.000}
    features = {
        'MFCC': {
            'coefficients': 12,
            'delta': True,
            'deltadelta': False
            },
        'SPECTRAL': {
            'flux': True,
            'fluxCentroid': True,
            'centroid': True,
            'harmonicity': True,
            'flatness': True,
            'rolloff': False}
    }

    write_config('test.conf', segmentation, features)
