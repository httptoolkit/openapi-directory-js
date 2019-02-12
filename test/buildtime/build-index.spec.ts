import { buildTrie } from "../../src/buildtime/build-index";
import { expect } from "chai";

describe('Index generation', () => {
    it('can generate simple trie data', () => {
        const trie = buildTrie({ 'ab': 'hi' });

        expect(trie).to.deep.equal({
            'a': { 'b': 'hi' }
        });
    });

    it('can generate trie data with overlapping strings', () => {
        const trie = buildTrie({
            'ab': 'hi',
            'abc': 'bye',
            'a': '123'
        });

        expect(trie).to.deep.equal({
            'a': { 'b': { '': 'hi', 'c': 'bye' }, '': '123' }
        });
    });
});