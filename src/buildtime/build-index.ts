import * as _ from 'lodash';
import { TrieData } from "../runtime/trie";

export function buildApiIndex(rootPath: string) {
    // Loop over every spec in rootPath
    // Get their base paths
    // Build a trie from the base paths
    // Compress the trie
}

export function buildTrie(map: { [key: string]: string }): TrieData {
    const root = <TrieData>{};

    _.forEach(map, (value, key) => {
        let trie: TrieData = root;
        _.forEach(key, (char, i) => {
            let nextStep = trie[char];

            if (i === key.length - 1) {
                // We're done - write our value into trie[char]

                if (_.isString(nextStep)) {
                    throw new Error('Duplicate key'); // Should really never happen
                } else if (typeof nextStep === 'object') {
                    // We're half way down another key - add an empty branch
                    nextStep[''] = value;
                } else {
                    // We're a fresh leaf at the end of a branch
                    trie[char] = value;
                }
            } else {
                // We have more to go - iterate into trie[char]

                if (typeof nextStep === 'string') {
                    // We're at what is currently a leaf value
                    // Transform it into a node with '' for the value.
                    nextStep = { '': nextStep };
                    trie[char] = nextStep;
                } else if (typeof nextStep === 'undefined') {
                    // We're adding a new branch to the trie
                    nextStep = {};
                    trie[char] = nextStep;
                }

                trie = nextStep;
            }
        });
    });

    return root;
}