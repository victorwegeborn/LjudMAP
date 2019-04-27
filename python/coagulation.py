import numpy as np
from scipy.spatial.distance import cdist
import json
import time

# HEURISTIC: for each segment moving left to right in the audio,
# if the distance to the adjacent segment is within some threshold
# then coagulate and repeat; otherwise end glob and begin coagulation
# with next segment

def run(X, settings):

    print('Coagulations started... ', end="")

    # start time
    t = time.time()

    # compute distance matrix
    D = cdist(X, X)
    #print(D)
    # time computation
    dist_matrix_computation = time.time() - t

    # extract passed data from UI
    tracker = settings['segmentation']['tracker']
    data = settings['segmentation']['data'] # start: [0], label: [1]
    threshold = settings['segmentation']['threshold']

    globs = []
    sequential = None
    glob_open = False
    i = 1
    while i < len(data)-2:
        start = data[i][0]
        end = data[i+1][0]
        label = data[i][1]
        # point set as excluded from glob?
        if tracker[label]:
            # is next point within radius?
            if D[i, i+1] <= threshold:
                # if the current glob is open, move to next element
                if glob_open:
                    pass
                # open new glob and append start
                else:
                    # finish sequential before starting glob
                    if sequential:
                        sequential['end'] = end/1000
                        globs.append(sequential)
                        sequential = {}

                    globs.append({
                        'type': 'glob',
                        'start': start/1000,
                        'end': None
                    })
                    glob_open = True
                i += 1
            # if its too far away
            else:
                # if glob is open, close it
                if glob_open:
                    glob_open = False
                    globs[-1]['end'] = end/1000
                # there is no glob active
                else:
                    # append end to sequential start
                    if sequential:
                        sequential['end'] = end/1000
                        globs.append(sequential)
                        sequential = {}
                    # start new sequential
                    else:
                        sequential = {
                            'type': 'sequential',
                            'start': start/1000,
                            'end': None
                        }
                i += 1

    # append end to last element
    globs[-1]['end'] = data[-1][0]/1000

    print(f' done in {(time.time()-t):.2f} (where distance matrix was {dist_matrix_computation:.2f})')
    return globs
