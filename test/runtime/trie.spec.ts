import * as _ from "lodash";
import { expect } from "chai";

import { buildTrie } from "../../src/buildtime/build-index";
import { Trie } from "../../src/runtime/trie";
import { objToInput, t } from "../test-helpers";

describe('Trie searching', () => {
    describe('with .get()', () => {
        it('can search a simple trie for a specific value', () => {
            const trie = new Trie(buildTrie(objToInput({
                'a': 'value'
            })));

            expect(trie.get('a')).to.equal('value');
        });

        it('returns undefined for missing values', () => {
            const trie = new Trie(buildTrie(objToInput({
                'a': 'value'
            })));

            expect(trie.get('ab')).to.equal(undefined);
        });

        it('can search a simple trie for a value thats part way down a path', () => {
            const trie = new Trie(buildTrie(objToInput({
                'a': 'value',
                'ab': 'value',
                'abc': 'value2'
            })));

            expect(trie.get('ab')).to.equal('value');
        });
    });

    describe('with .getLongestMatchingPrefix()', () => {
        it('can search a simple trie for an exact value', () => {
            const trie = new Trie(buildTrie(objToInput({
                'a': 'value'
            })));

            expect(trie.getMatchingPrefix('a')).to.equal('value');
        });

        it('can search a simple trie for an array value', () => {
            const trie = new Trie(buildTrie(objToInput({
                'a': ['value1', 'value2']
            })));

            expect(trie.getMatchingPrefix('a')).to.deep.equal(
                ['value1', 'value2']
            );
        });

        it('can search a trie for an exact value part way down a path', () => {
            const trie = new Trie(buildTrie(objToInput({
                'a': 'value',
                'ab': 'value',
                'abc': 'value2'
            })));

            expect(trie.getMatchingPrefix('ab')).to.equal('value');
        });

        it('can search a trie for a prefix', () => {
            const trie = new Trie(buildTrie(objToInput({
                'a': 'value',
                'ab': 'value',
                'abcd': 'value2',
                'abcdef': 'value3'
            })));

            expect(trie.getMatchingPrefix('abcde')).to.equal('value2');
        });

        it('can search a trie through a regex', () => {
            const trie = new Trie(buildTrie(t([
                [['a/'], 'value'],
                [['ab/', /^[^/]+/, '/d'], 'value2'],
                [['ab/', /^[^/]+/], 'value3'],
                [['ab/c/d'], 'value4'],
            ])));

            expect(trie.getMatchingPrefix('ab/c/d')).to.equal('value4');
            expect(trie.getMatchingPrefix('ab/X/e')).to.equal('value3');
            expect(trie.getMatchingPrefix('ab/X/d')).to.equal('value2');
        });
    });

    describe('given a large trie', () => {

        const keys = _.range(10000).map(k => k.toString());
        let rawIndex: any;
        let trie: Trie;

        before(() => {
            rawIndex = _.zipObject(
                keys,
                keys.map(k => `value${k}`)
            );

            const trieData = buildTrie(objToInput(rawIndex));

            trie = new Trie(trieData);
        });

        it('can search by key quickly', function () {
            this.timeout(500); // 10000 in < 500ms = < 50 microseconds/search

            keys.forEach((k) => {
                expect(trie.get(k)).to.equal(`value${k}`);
            });

            // This is actually ~8x slower than a bare hashtable, for direct
            // lookups. As long as it's within an order of magnitude or two though,
            // that's ok. The real magic comes in prefix searching.
        });

        it.skip('can search by key quickly (hashtable)', function () {
            this.timeout(10000);

            keys.forEach((k) => {
                expect(rawIndex[k]).to.equal(`value${k}`);
            });
        });

        it('can search by prefix quickly', function () {
            this.timeout(1000); // 10000 in < 1000ms = < 100 microseconds/search

            keys.forEach((k) => {
                const withSuffix = k + '-suffix';
                expect(trie.getMatchingPrefix(withSuffix)).to.equal(`value${k}`);
            });

            // This is the key perf step - doing an equivalent loop on a hashtable
            // (for all keys, find keys that start with the input, get the longest)
            // is approx 25x slower than this, for 10000 elements.
        });

        it.skip('can search a large trie quickly (hashtable for comparison)', function () {
            this.timeout(10000);

            keys.forEach((k) => {
                expect(_.find(rawIndex, (_v, key) => key.startsWith(k))!).to.equal(`value${k}`);
            });
        });
    });

});