import wave
import subprocess
import json
import os
import numpy

def getJson(output_dir, audio_path, step_size, n_windows):

    # load audio data
    with wave.open(audio_path, 'r') as audio:

        # audio meta data
        n_frames = audio.getnframes()
        rate = audio.getframerate()
        n_channels = audio.getnchannels()

        # running time in ms
        running_time = n_frames / rate * 1000

        # total time. Also number of pixles used in UI
        total_time = step_size * n_windows

        waveform_path = output_dir + 'wavedata.json'
        tmp_audio_path = output_dir + 'tmp.wav'

        if running_time != total_time:

            # number of windowed frames
            n = int(total_time * rate / 1000)

            # pad audio
            if n > n_frames:
                # make bytes mutable
                frames = bytearray(audio.readframes(n))
                for _ in range(n_frames, n):
                    frames.append(0)
                frames = bytes(frames)


            # cut audio
            elif n < n_frames:
                frames = audio.readframes(n)

            with wave.open(tmp_audio_path, 'w') as f:
                p = audio.getparams()
                f.setparams(p)
                f.setnframes(n)
                f.writeframes(frames)

            # make sure to use tmp file
            audio_path = tmp_audio_path

        # generate waveform data
        subprocess.call(['audiowaveform',
                         '-i', audio_path,
                         '-o', waveform_path,
                         '-z', str(150),
                         '-b', '8',
                        ])

        if os.path.isfile(tmp_audio_path):
            os.remove(tmp_audio_path)

        # read and return waveform data
        with open(waveform_path, 'r') as f:
            d = json.load(f)
            d['max'] = int(numpy.amax(d['data']))
            d['min'] = int(numpy.amin(d['data']))
            return d


if __name__ == '__main__':
    d = getJson('../../data/', '../../data/flute.wav', 1000, 450)
    del d['data']
    print(d)
