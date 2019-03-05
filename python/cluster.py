from MulticoreTSNE import MulticoreTSNE as TSNE
from sklearn.decomposition import PCA
from minisom import MiniSom
import umap
from itertools import count
import numpy as np
import random


def get_cluster_data(data, n_components=3):
    print(f'Clustering started with {n_components} components.')

    # Run data through t-SNE
    tsne = TSNE(n_components=n_components, perplexity=25)#, random_state=None)
    Y1 = convert_range(tsne.fit_transform(data))
    print("t-SNE done")

    # Run data through PCA
    pca = PCA(n_components=n_components)
    Y2 = convert_range(pca.fit_transform(data))
    print("PCA done")

    # Run data through SOM
    som = False
    if som:
        som = MiniSom(25, 25, len(data[0]), sigma=0.001, learning_rate=0.6)
        som.train_random(data, 100)
        Y3 = convert_range(np.array([np.array(som.winner(i)) for i in range(len(data))]))
        print("SOM done")
    else:
        Y3 = convert_range(np.array([np.array([random.randint(-50, 50), random.randint(-50, 50)]) for i in range(len(Y2))]))

    # Run data through UMAP
    run_umap = True
    if run_umap:
        Y4 = convert_range(umap.UMAP(n_components=n_components).fit_transform(data))
        print("UMAP done")
    else:
        Y4 = convert_range(np.array([np.array([random.randint(-50, 50), random.randint(-50, 50)]) for i in range(len(Y2))]))

    return zip(count(), Y1, Y2, Y3, Y4)

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
