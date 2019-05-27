"""
openSMILE configuration building.

Builds tree from selected features by recursivly probing down
the requirements of each and every openSMILE component.
Improved computational time alot, but increased demand on memory.

Could be optimized further with static classes to unload memory.
A hashmap (dict) could be used to track the buildin of the tree
instead of iterating through it for each new component.
However, the tree is often small and sould be fast either way.


Author: Victor Hansjons Vegeborn 2019
"""

import subprocess
import pandas
import numpy as np
import sys
from sklearn.preprocessing import minmax_scale
import os
script_dir = os.path.dirname(__file__)

np.set_printoptions(threshold=np.nan)


def write_config(target_path, settings, features):
    t = Config_Tree(target_path)
    t.write_config(settings, features)

class Config_Tree:
    def __init__(self, path, n_threads=1, verboseness=0):
        # build tree
        self.__tree = []

        # target path
        self.__path = path

        # putput to write
        self.__output = ''

        self.__n_threads = n_threads;
        self.__verboseness = verboseness;

    def get_component_manager(self):
        self.__output = ('[componentInstances:cComponentManager]\n'
                         'instance[dataMemory].type=cDataMemory\n')

        for component in self.__tree:
            self.__output += component.get_instance()

        self.__output += (f'\nnThreads={self.__n_threads}\n'
                          f'printLevelStats={self.__verboseness}\n\n')



    def write_config(self, settings, features):

        output_readers = ''

        # check for mfccs
        if not features['mfccs']['disabled']:
            mfcc = Mfcc(features['mfccs'])
            self._build(mfcc)
            self.__tree.append(mfcc)
            output_readers += f'{mfcc.writer()};'

            if features['mfccs']['delta']:
                delta = Delta(writer='delta')
                self._build(delta)
                self.__tree.append(delta)
                output_readers += f'{delta.writer()};'

            if features['mfccs']['deltadelta']:
                deltadelta = Delta(writer='deltadelta')
                self._build(deltadelta)
                self.__tree.append(deltadelta)
                output_readers += f'{deltadelta.writer()};'

        if not features['spectrals']['disabled'] and True in features['spectrals'].values():
            spectral = Spectral(features['spectrals'])
            self._build(spectral)
            self.__tree.append(spectral)
            output_readers += f'{spectral.writer()};'

        if not features['signals']['disabled'] and True in features['signals'].values():
            if features['signals']['rms']:
                rms = Energy()
                self._build(rms)
                self.__tree.append(rms)
                output_readers += f'{rms.writer()};'

            if features['signals']['zcr']:
                zcr = ZCR()
                self._build(zcr)
                self.__tree.append(zcr)
                output_readers += f'{zcr.writer()};'

        # add concat and csv sink
        self.__tree.append(VectorConcatOutput(reader=output_readers))
        self.__tree.append(CsvSink())

        self.get_component_manager()

        for component in self.__tree:
            self.__output += component.get_header()
            self.__output += component.get_reader()
            self.__output += component.get_writer()
            if component.get_component_type() == 'cFramer':
                self.__output += component.get_body(settings['segmentation'])
            else:
                self.__output += component.get_body()




        with open(self.__path, 'w') as f:
            f.write(self.__output)

    def _build(self, o):

        requirements = o.get_requirements()
        for i, req in enumerate(requirements):
            node = self.__check_tree(req)
            if node:
                o.set_reader(node.writer())
                continue

            if req == 'cWaveSource':
                node = Source()
                self.__tree.append(node)
                o.set_reader(node.writer())
                return

            elif req == 'cFramer':
                node = Framer()

            elif req == 'cWindower':
                node = Windower()

            elif req == 'cTransformFFT':
                node = FFT()

            elif req == 'cFFTmagphase':
                node = MagPhase()

            elif req == 'cMelspec':
                node = MelSpec()

            elif req == 'cEnergy:log':
                node = Energy(writer='log')

            elif req == 'cDeltaRegression:delta':
                node = Delta(writer='delta')

            elif req == 'cVectorConcat':
                cat_req = requirements[i+1].split(',')
                # pass dummy objects to build
                node = VectorConcat(requirements=cat_req)
                self._build(node)
                self.__tree.append(node)
                o.set_reader(node.writer())
                break

            else:
                print('Could not find requirement:', req)
            self._build(node)
            self.__tree.append(node)
            o.set_reader(node.writer())



    def __check_tree(self, req):
        requirement = req.split(':')
        if len(requirement) == 1:
            for component in self.__tree:
                typ = component.get_component_type()
                if req == typ:
                    return component
        else:
            for component in self.__tree:
                typ = component.get_component_type()
                name = component.get_component_name()
                if requirement[0] == typ and requirement[1] == name:
                    return component
        return None



""" COMPONENT SUPERCLASS """

class Component:
    def __init__(self, component_name, component_type, reader=None, writer=None,):
        self.__reader = reader
        self.__writer = writer
        self.__component_name = component_name
        self.__component_type = component_type
        self.requirements = None
        global concat_counter
        concat_counter = 0

    def get_reader(self):
        if self.__reader:
            return f'reader.dmLevel={self.__reader}\n'
        else:
            return ''

    def set_reader(self, reader):
        if not self.__reader:
            self.__reader = reader
        else:
            self.__reader += f';{reader}'
    def get_writer(self):
        if self.__writer:
            return f'writer.dmLevel={self.__writer}\n'
        else:
            return ''

    def writer(self):
        return self.__writer

    def reader(self):
        return self.__reader

    def get_header(self):
        return f'[{self.__component_name}:{self.__component_type}]\n'

    def get_instance(self):
        return f'instance[{self.__component_name}].type={self.__component_type}\n'

    def get_body(self):
        return 'ERROR -- BODY NOT FOUND\n'

    def get_component_type(self):
        return self.__component_type

    def get_component_name(self):
        return self.__component_name

    def get_requirements(self):
        return self.requirements



""" SIGNAL PROCESSERS """

class Source(Component):
    def __init__(self):
        super().__init__(component_name='waveIn',
                         component_type='cWaveSource',
                         writer='wave')


    def get_body(self):
        return ('buffersize_sec = 5.0\n'
                'filename=\\cm[inputfile(I){test.wav}:name of input file]\n'
                'start=\\cm[start{0}:audio start position in seconds]\n'
                'end=\\cm[end{-1}:audio end position in seconds, -1 for end of file]\n'
                'monoMixdown=1\n'
                'outFieldName = pcm\n\n')





class Framer(Component):
    def __init__(self, reader=None):
        super().__init__(component_name='framer',
                         component_type='cFramer',
                         writer='frames', reader=reader)

        self.requirements = ['cWaveSource']


    def get_body(self, segmentation):
        self.size = segmentation['size']/1000
        self.step = segmentation['step']/1000
        return ('noPostEOIprocessing = 1\n'
                'copyInputName = 0\n'
                f'frameSize={self.size}\n'
                f'frameStep={self.step}\n'
                'frameMode=fixed\n'
                'frameCenterSpecial = left\n\n')





class Windower(Component):
    def __init__(self, reader=None):
        super().__init__(component_name='win',
                         component_type='cWindower',
                         writer='winframes', reader=reader)

        self.requirements = ['cFramer']

    def get_body(self):
        return ('copyInputName = 0\n'
                'processArrayFields = 1\n'
                'winFunc = ham\n'
                'gain = 1.0\n'
                'offset = 0\n\n')




class FFT(Component):
    def __init__(self, reader=None):
        super().__init__(component_name='fft',
                         component_type='cTransformFFT',
                         writer='fft', reader=reader)

        self.requirements = ['cWindower']

    def get_body(self):
        return ('copyInputName = 0\n'
                'processArrayFields = 1\n'
                'inverse = 0\n'
                'zeroPadSymmetric = 0\n\n')




class MagPhase(Component):
    def __init__(self, reader=None):
        super().__init__(component_name='fftmag',
                         component_type='cFFTmagphase',
                         writer='fftmag', reader=reader)

        self.requirements = ['cTransformFFT']

    def get_body(self):
        return 'copyInputName=0\n\n'




class MelSpec(Component):
    def __init__(self, reader=None):
        super().__init__(component_name='melspec',
                         component_type='cMelspec',
                         writer='melspec', reader=reader)

        self.requirements = ['cFFTmagphase']

    def get_body(self):
        return ('copyInputName = 0\n'
                'processArrayFields = 1\n'
                'nBands = 26\n'
                'usePower = 1\n'
                'lofreq = 0\n'
                'hifreq = 16000\n'
                'specScale = mel\n'
                'inverse = 0\n\n')




""" LOW LEVEL DESCRIPTORS """

class Mfcc(Component):
    def __init__(self, mfccs, reader=None):
        super().__init__(component_name='mfcc',
                         component_type='cMfcc',
                         writer='mfcc', reader=reader)

        self.requirements = ['cMelspec']
        self.__coefficients = mfccs['coefficients']

    def get_body(self):
        return ('copyInputName = 0\n'
                'processArrayFields = 1\n'
                'firstMfcc = 1\n'
               f'lastMfcc = {self.__coefficients}\n'
                'cepLifter = 22.0\n\n')




class Spectral(Component):
    def __init__(self, spectrals, reader=None):
        super().__init__(component_name='spec',
                         component_type='cSpectral',
                         writer='spec', reader=reader)

        self.requirements = ['cFFTmagphase']

        # parse values
        self.centroid = 1 if spectrals['centroid'] else 0
        self.flatness = 1 if spectrals['flatness'] else 0
        self.flux = 1 if spectrals['flux'] else 0
        self.fluxcentroid = 1 if spectrals['fluxcentroid'] else 0
        self.harmonicity = 1 if spectrals['harmonicity'] else 0
        self.slope = 1 if spectrals['slope'] else 0

    def get_body(self):
        return ('processArrayFields=1\n'
                'copyInputName=0\n'
               f'flux={self.flux}\n'
               f'fluxCentroid={self.fluxcentroid}\n'
               f'centroid={self.centroid}\n'
               f'harmonicity={self.harmonicity}\n'
               f'flatness={self.flatness}\n'
               f'slope={self.slope}\n'
                'maxPos = 0\n'
                'minPos = 0\n'
                'normBandEnergies=1\n\n')




class Energy(Component):
    def __init__(self, writer='rms', reader=None):
        super().__init__(component_name=writer,
                         component_type='cEnergy',
                         writer=writer, reader=reader)

        self.requirements = ['cFramer']
        self.rms = 1 if writer == 'rms' else 0
        self.log = 0 if writer == 'rms' else 1

    def get_body(self):
        return (f'nameAppend = {self.writer()}\n'
                 'copyInputName = 0\n'
                 'processArrayFields = 0\n'
                f'rms = {self.rms}\n'
                f'log = {self.log}\n\n')




class ZCR(Component):
    def __init__(self, reader=None):
        super().__init__(component_name='zcr',
                         component_type='cMZcr',
                         writer='mzcr', reader=reader)

        self.requirements = ['cFramer']

    def get_body(self):
        return ('nameAppend = zcr\n'
                'copyInputName = 0\n'
                'processArrayFields = 1\n'
                'zcr = 1\n'
                'amax = 0\n'
                'mcr = 0\n'
                'maxmin = 0\n'
                'dc = 0\n\n')


""" REGRESSION """

class Delta(Component):
    def __init__(self, writer, reader=None, requirements=None):
        super().__init__(component_name=writer,
                         component_type='cDeltaRegression',
                         writer=writer, reader=reader)

        if writer == 'delta':
            self.requirements = ['cVectorConcat', 'cMfcc,cEnergy:log']
        if writer == 'deltadelta':
            self.requirements = ['cDeltaRegression:delta']


    def get_body(self):
        return ('nameAppend = de\n'
                'copyInputName = 1\n'
                'noPostEOIprocessing = 0\n'
                'deltawin=2\n'
                'blocksize=1\n\n')




""" MISC """

class VectorConcat(Component):


    def __init__(self, requirements, readers=None):
        global concat_counter
        concat_counter += 1
        super().__init__(component_type='cVectorConcat',
                         component_name=f'cat{concat_counter}',
                         reader=readers, writer=f'cat{concat_counter}')



        # list of requirements for concatination
        self.requirements = requirements

    def get_body(self):
        return ('copyInputName = 1\n'
                'processArrayFields = 1\n\n')

""" CONCATINATION AND OUPUT """

class VectorConcatOutput(Component):
    def __init__(self, reader):
        super().__init__(component_name='lldconcat',
                         component_type='cVectorConcat',
                         reader=reader, writer='lld')


    def get_body(self):
        return ('includeSingleElementFields = 1\n\n')



class CsvSink(Component):
    def __init__(self):
        super().__init__(component_name='lldcsvsink',
                         component_type='cCsvSink',
                         reader='lld', writer='')


    def get_body(self):
        return ('filename=\cm[O{?}:output csv file for LLD, disabled by default ?, only written if filename given]\n'
                'append = \cm[append{0}:set to 1 to append to the LLD output csv file, default is not to append]\n'
                'timestamp = 0\n'
                'number = 0\n'
                'printHeader = 1\n'
                'errorOnNoOutput = 1\n\n')


if __name__ == '__main__':
    test_path = 'configuration/testing/'
    test_config = test_path + 'test2.conf'
    test_audio =  test_path + 'test.wav'
    test_list = test_path + 'list.txt'
    test_csv = test_path + 'test2.csv'

    t = Config_Tree(test_config)

    settings = {
        "segmentation": {
            "mode": "uniform",
            "size": 500.0,
            "step": 500.0,
        }
    }

    features = {
        "mfccs": {
            "coefficients": 15,
            "delta": True,
            "deltadelta": True,
            "disabled": False
        },
        "signals": {
            "disabled": False,
            "rms": True,
            "zcr": True
        },
        "spectrals": {
            "centroid": True,
            "disabled": False,
            "flatness": True,
            "flux": True,
            "fluxcentroid": True,
            "harmonicity": True,
            "slope": True
        }
    }


    t.write_config(features, settings)
    subprocess.call(['../opensmile-2.3.0/SMILExtract',  "-C", test_config, "-I", test_audio, "-O", test_csv])
