import umap
from itertools import count
import numpy as np
import random
import time

def run(X, Y=None, n_components=3, n_neighbors=15, metric='euclidean'):
    start_time = time.time()
    if Y:
        print(f'Supervised-UMAP :: {n_components} components, {n_neighbors} neighbours, {metric}-metric... ', end='')
        result = convert_range(umap.UMAP(n_components=n_components, metric=metric, n_neighbors=n_neighbors).fit_transform(X, y=Y))
    else:
        print(f'UMAP :: {n_components} components, {n_neighbors} neighbours, {metric}-metric... ', end='')
        result = convert_range(umap.UMAP(n_components=n_components, metric=metric, n_neighbors=n_neighbors).fit_transform(X))
    print(f'done in {time.time()-start_time:.2f}s')
    return result


def convert_range(Y):
    new_range = (80 - (-80))
    Y_x = Y[:,0]

    old_range_x = (max(Y_x) - min(Y_x))
    new_Y_x = (((Y_x - min(Y_x)) * new_range) / old_range_x) + (-80)

    Y_y = Y[:,1]
    old_range_y = (max(Y_y) - min(Y_y))
    new_Y_y = (((Y_y - min(Y_y)) * new_range) / old_range_y) + (-80)

    if Y.shape[1] > 2:
        Y_z = Y[:,2]
        old_range_z = (max(Y_z) - min(Y_z))
        new_Y_z = (((Y_z - min(Y_z)) * new_range) / old_range_z) + (-80)
        return np.array((new_Y_x, new_Y_y, new_Y_z)).T
    else:
        return np.array((new_Y_x, new_Y_y, np.zeros(Y.shape[0]))).T
