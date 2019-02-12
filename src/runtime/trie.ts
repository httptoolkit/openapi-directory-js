export interface TrieData {
    ''?: string;
    [nextKey: string]:
    | TrieData
    | string
    | undefined;
}

export class Trie {

    constructor(private root: TrieData) { }

    /*
     * Given a key, finds an exact match and returns the value.
     * Returns undefined if no match can be found.
     */
    get(key: string): string | undefined {
        return undefined;
    }

    /*
     * Given a key, finds the longest key that is a prefix of this
     * key, and returns its value. I.e. for input 'abcdef', 'abc'
     * would match in preference to 'ab', and 'abcdefg' would never
     * be matched.
     *
     * Returns undefined if no match can be found.
     */
    getLongestMatchingPrefix(key: string): string | undefined {
        return undefined;
    }
}