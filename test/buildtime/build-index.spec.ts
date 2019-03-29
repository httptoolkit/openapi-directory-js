import { expect } from "chai";
import { objToInput, objToTrie, t } from '../test-helpers';

import { buildTrie, optimizeTrie, buildNaiveTrie } from "../../src/buildtime/build-index";


describe('Index generation', () => {
    it('can generate simple compressed trie data', () => {
        const trie = buildTrie(objToInput({ 'ab': 'hi' }));

        expect(trie).to.deep.equal(objToTrie({
            'ab': 'hi'
        }));
    });

    it('can generate simple branching trie data', () => {
        const trie = buildTrie(objToInput({
            'abc': 'hi',
            'acb': 'there'
        }));

        expect(trie).to.deep.equal(objToTrie({
            'ab': { 'c': 'hi' },
            'ac': { 'b': 'there' }
        }));
    });

    it('can generate a trie for a series of substrings', () => {
        const trie = buildTrie(objToInput({
            'a': 'value1',
            'ab': 'value2',
            'abcd': 'value3',
            'abcdef': 'value4',
        }));

        expect(trie).to.deep.equal(objToTrie({
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
        }));
    });

    it('can generate trie data including arrays', () => {
        const trie = buildTrie(objToInput({
            'ab': ['hi', 'there'],
            'c': 'bye'
        }));

        expect(optimizeTrie(trie)).to.deep.equal(objToTrie({
            'a': { 'b': ['hi', 'there'] },
            'c': 'bye'
        }));
    });

    it('can generate trie data including regular expressions', () => {
        const trie = buildTrie(new Map<
            Array<string | RegExp>,
            string | string[]
        >([
            [['ab', /.*/, 'd'], ['result']],
            [['c'], 'bye']
        ]));

        expect(trie).to.deep.equal(t([
            ['a', t([
                [ 'b', t([
                    [/.*/, t([
                        ['d', ['result']]
                    ])]
                ])]
            ])],
            ['c', 'bye']
        ]));
    });
});

describe('Naive trie generation', () => {
    it('can generate simple trie data', () => {
        const trie = buildNaiveTrie(objToInput({ 'ab': 'hi' }));

        expect(trie).to.deep.equal(objToTrie({
            'a': { 'b': 'hi' }
        }));
    });

    it('can generate trie data with overlapping strings', () => {
        const trie = buildNaiveTrie(objToInput({
            'ab': 'hi',
            'abcd': 'bye',
            'a': '123'
        }));

        expect(trie).to.deep.equal(objToTrie({
            'a': { 'b': { '': 'hi', 'c': { 'd': 'bye' } }, '': '123' }
        }));
    });
});

describe('Trie optimization', () => {
    it('can simplify single child nodes', () => {
        const trie = objToTrie({
            'a': { 'b': 'value' }
        });

        expect(optimizeTrie(trie)).to.deep.equal(objToTrie({
            'ab': 'value'
        }));
    });

    it('can simplify single child nodes with branches en route', () => {
        const trie = objToTrie({
            'a': { 'b': { '': 'value1', 'c': 'value2' }, 'c': 'value3' }
        });

        expect(optimizeTrie(trie)).to.deep.equal(objToTrie({
            'ab': { '': 'value1', 'c': 'value2' },
            'ac': 'value3'
        }));
    });

    it('correctly simplifies complex tries without compressing leaf keys', () => {
        const trie = objToTrie({
            a: {
                '': 'value1',
                b: {
                    '': 'value3',
                    c: {
                        d: 'value4'
                    }
                }
            }
        });

        expect(optimizeTrie(trie)).to.deep.equal(objToTrie({
            a: {
                '': 'value1',
                b: {
                    '': 'value3',
                    cd: 'value4'
                }
            }
        }));
    });
});