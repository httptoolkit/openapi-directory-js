import { expect } from "chai";

import { buildTrie, optimizeTrie, buildNaiveTrie } from "../../src/buildtime/build-index";

describe('Index generation', () => {
    it('can generate simple compressed trie data', () => {
        const trie = buildTrie({ 'ab': 'hi' });

        expect(trie).to.deep.equal({
            'ab': 'hi'
        });
    });

    it('can generate simple branching trie data', () => {
        const trie = buildTrie({
            'abc': 'hi',
            'acb': 'there'
        });

        expect(trie).to.deep.equal({
            'ab': { 'c': 'hi' },
            'ac': { 'b': 'there' }
        });
    });

    it('can generate a trie for a series of substrings', () => {
        const trie = buildTrie({
            'a': 'value1',
            'ab': 'value2',
            'abcd': 'value3',
            'abcdef': 'value4',
        });

        expect(trie).to.deep.equal({
            a: {
                '': 'value1',
                b: {
                    '': 'value2',
                    cd: {
                        '': 'value3',
                        ef: 'value4'
                    }
                }
            }
        });
    });

    it('can generate trie data including arrays', () => {
        const trie = buildTrie({
            'ab': ['hi', 'there'],
            'c': 'bye'
        });

        expect(trie).to.deep.equal({
            'a': { 'b': ['hi', 'there'] },
            'c': 'bye'
        });
    });
});

describe('Naive trie generation', () => {
    it('can generate simple trie data', () => {
        const trie = buildNaiveTrie({ 'ab': 'hi' });

        expect(trie).to.deep.equal({
            'a': { 'b': 'hi' }
        });
    });

    it('can generate trie data with overlapping strings', () => {
        const trie = buildNaiveTrie({
            'ab': 'hi',
            'abcd': 'bye',
            'a': '123'
        });

        expect(trie).to.deep.equal({
            'a': { 'b': { '': 'hi', 'c': { 'd': 'bye' } }, '': '123' }
        });
    });
});

describe('Trie optimization', () => {
    it('can simplify single child nodes', () => {
        const trie = {
            'a': { 'b': 'value' }
        };

        expect(optimizeTrie(trie)).to.deep.equal({
            'ab': 'value'
        });
    });

    it('can simplify single child nodes with branches en route', () => {
        const trie = {
            'a': { 'b': { '': 'value1', 'c': 'value2' }, 'c': 'value3' }
        };

        expect(optimizeTrie(trie)).to.deep.equal({
            'ab': { '': 'value1', 'c': 'value2' },
            'ac': 'value3'
        });
    });

    it('correctly simplifies complex tries without compressing leaf keys', () => {
        const trie = {
            a: {
                '': 'value1',
                b: {
                    '': 'value3',
                    c: {
                        d: 'value4'
                    }
                }
            }
        };

        expect(optimizeTrie(trie)).to.deep.equal({
            a: {
                '': 'value1',
                b: {
                    '': 'value3',
                    cd: 'value4'
                }
            }
        });
    });
});