import numpy as np
from scipy.spatial.distance import cdist
import json
import time

# HEURISTIC: for each segment moving left to right in the audio,
# if the distance to the adjacent segment is within some threshold
# then coagulate and repeat; otherwise end glob and begin coagulation
# with next segment

def get_glob(start_point, end_point):
    id,  start,  length,  label,  song_id,  position, _ = start_point
    _,  _start, _length,      _,        _,         _, _ = end_point
    return [start, (_start - start + _length), song_id, position, label]

def run(X, coagulation_data, feature_data, settings):

    print('Coagulations started... ', end="")

    # start time
    t = time.time()

    # compute distance matrix
    D = cdist(X, X)
    #print(D)
    # time computation
    dist_matrix_computation = time.time() - t

    # extract passed data from UI
    # [id, start (s), length (s), category (-1 if excluded), song_id, position (-1), included (0 = no, 1 = yes)]
    # delete first row header
    coagulation_data = coagulation_data[1:]

    # get passed threshold from UI
    threshold = settings['segmentation']['threshold']


    # coagulation results
    result = []
    feature_rows = []

    current_song_id = coagulation_data[0][4]
    glob_start_point = None
    glob_start_index = None
    i = 0 # ignore data header
    while i < len(coagulation_data):
        # extract coagulation data point properties
        _, start, length, label, song_id, position, included = coagulation_data[i]


        # do not coagulate over songs
        if current_song_id != song_id:
            current_song_id = song_id
            if glob_start_point:
                result.append(get_glob(glob_start_point, coagulation_data[i-1]))
                feature_rows.append([glob_start_index, i-1])
                glob_start_point = None
                glob_start_index = None


        # This is the last segment
        elif i == len(coagulation_data)-1:
            # This segment should be included in the currently
            # opened glob. Add this as end point to current glob
            if glob_start_point:
                result.append(get_glob(glob_start_point, coagulation_data[i]))
                feature_rows.append([glob_start_index, i])
                glob_start_point = None
                glob_start_index = None

            # There is no opened glob. Add as sole segment
            else:
                result.append([start, length, song_id, position, label])
                feature_rows.append([i, i])

            # Break out of computation.
            # all segments have been checked.
            break


        # point set as included from coagulation
        elif included > 0:



            # is next point within radius?
            if D[i, i+1] < threshold:
                if not glob_start_point:
                    glob_start_point = coagulation_data[i]
                    glob_start_index = i

            # Not within radius, but globbing has started
            elif glob_start_point:
                # end glob with previous segment
                result.append(get_glob(glob_start_point, coagulation_data[i]))
                feature_rows.append([glob_start_index, i])
                glob_start_point = None
                glob_start_index = None

            else:
                # Next segment is neither within distance,
                # and should not be globbed with previous segment
                result.append([start, length, song_id, position, label])
                feature_rows.append([i, i])
            i += 1


        # This segment should not be in the coagulation
        else:
            # although, a glob has started
            if glob_start_point:
                # end glob
                result.append(get_glob(glob_start_point, coagulation_data[i-1]))
                feature_rows.append([glob_start_index, i-1])
                glob_start_index = None
                glob_start_point = None
                # DO NOT MOVE FORWARD
            else:
                result.append([start, length, song_id, position, label])
                feature_rows.append([i, i])
                i += 1

    """
    # debug stuff
    duration = 0
    for row in result:
        print(row)
        duration += row[1]
    print('accumilated length:', duration)
    print('N rows in result', len(result))
    print('threshold:', threshold)
    print(np.max(np.max(D)))
    print(coagulation_data[-1])
    """

    # allocate array for new coagulated feature data
    X_features = np.zeros((len(result), feature_data.shape[1]))
    for i, row in enumerate(feature_rows):
        start, end = row
        if start == end:
            X_features[i,None,:] = feature_data[start,None,:]
        else:
            X_features[i,None,:] = np.mean(feature_data[start:end,None,:], axis=0)



    print(f' done in {(time.time()-t):.2f} (where distance matrix was {dist_matrix_computation:.2f})')
    return X_features, result
