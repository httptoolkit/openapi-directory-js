type TrieLeafValue = string | string[];

type TrieValue =
    | TrieData
    | TrieLeafValue
    | undefined;

export interface TrieData {
    ''?: TrieLeafValue;
    [nextKey: string]: TrieValue;
}

export function isLeafValue(value: any): value is TrieLeafValue {
    return typeof value === 'string' || Array.isArray(value);
}

export class Trie {

    constructor(private root: TrieData) { }

    private _getLongestMatchingPrefix(key: string) {
        let remainingKey = key;
        let node: TrieData | undefined = this.root;

        while (node) {
            const keyLength = Object.keys(node)
                .reduce((maxLength, key) => Math.max(key.length, maxLength), 0);
            const keyToMatch = remainingKey.slice(0, keyLength);
            remainingKey = remainingKey.slice(keyLength);

            const nextNode: TrieValue = node[keyToMatch];

            if (isLeafValue(nextNode)) {
                // We've reached the end of a key - if we're out of
                // input, that's good, if not it's just a prefix.
                return {
                    remainingKey,
                    matchedKey: key.slice(0, -1 * remainingKey.length),
                    value: nextNode
                };
            } else {
                node = nextNode;
            }
        }

        return undefined;
    }

    /*
     * Given a key, finds an exact match and returns the value(s).
     * Returns undefined if no match can be found.
     */
    get(key: string): string | string[] | undefined {
        const searchResult = this._getLongestMatchingPrefix(key);

        if (!searchResult) return undefined;

        const {
            remainingKey,
            value
        } = searchResult;

        return remainingKey.length === 0 ?
            value : undefined;
    }

    /*
     * Given a key, finds the longest key that is a prefix of this
     * key, and returns its value(s). I.e. for input 'abcdef', 'abc'
     * would match in preference to 'ab', and 'abcdefg' would never
     * be matched.
     *
     * Returns undefined if no match can be found.
     */
    getMatchingPrefix(key: string): string | string[] | undefined {
        const searchResult = this._getLongestMatchingPrefix(key);

        if (!searchResult) return undefined;

        const { value } = searchResult;

        return value;
    }
}