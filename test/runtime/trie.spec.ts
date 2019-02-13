import * as _ from "lodash";
import { expect } from "chai";

import { buildTrie } from "../../src/buildtime/build-index";
import { Trie } from "../../src/runtime/trie";

describe('Trie searching', () => {
    describe('with .get()', () => {
        it('can search a simple trie for a specific value', () => {
            const trie = new Trie(buildTrie({
                'a': 'value'
            }));

            expect(trie.get('a')).to.equal('value');
        });

        it('returns undefined for missing values', () => {
            const trie = new Trie(buildTrie({
                'a': 'value'
            }));

            expect(trie.get('ab')).to.equal(undefined);
        });

        it('can search a simple trie for a value thats part way down a path', () => {
            const trie = new Trie(buildTrie({
                'a': 'value',
                'ab': 'value',
                'abc': 'value2'
            }));

            expect(trie.get('ab')).to.equal('value');
        });

        it('can search a large trie quickly', function () {
            this.timeout(500); // 10000 in < 500ms = < 50 microseconds/search
            const keys = _.range(10000).map(k => k.toString());

            const trieData = buildTrie(
                _.zipObject(
                    keys,
                    keys.map(k => `value${k}`)
                )
            );

            const trie = new Trie(trieData);

            keys.forEach((k) => {
                expect(trie.get(k)).to.equal(`value${k}`);
            });

            // This is actually ~3x slower than a bare hashtable, for direct
            // lookups. As long as it's within an order of magnitude or so though,
            // that's ok. The real magic comes in prefix searching.
        });
    });

    describe('with .getLongestMatchingPrefix()', () => {
        it('can search a simple trie for an exact value', () => {
            const trie = new Trie(buildTrie({
                'a': 'value'
            }));

            expect(trie.getMatchingPrefix('a')).to.equal('value');
        });

        it('can search a simple trie for an array value', () => {
            const trie = new Trie(buildTrie({
                'a': ['value1', 'value2']
            }));

            expect(trie.getMatchingPrefix('a')).to.deep.equal(
                ['value1', 'value2']
            );
        });

        it('can search a trie for an exact value part way down a path', () => {
            const trie = new Trie(buildTrie({
                'a': 'value',
                'ab': 'value',
                'abc': 'value2'
            }));

            expect(trie.getMatchingPrefix('ab')).to.equal('value');
        });

        it('can search a trie for a prefix', () => {
            const trie = new Trie(buildTrie({
                'a': 'value',
                'ab': 'value',
                'abc': 'value2'
            }));

            expect(trie.getMatchingPrefix('abcd')).to.equal('value2');
        });

        it('can search a large trie quickly', function () {
            this.timeout(500); // 10000 in < 500ms = 50 microseconds max
            const keys = _.range(10000).map(k => k.toString());

            const trieData = buildTrie(
                _.zipObject(
                    keys,
                    keys.map(k => `value${k}`)
                )
            );

            const trie = new Trie(trieData);

            keys.forEach((k) => {
                expect(trie.getMatchingPrefix(k)).to.equal(`value${k}`);
            });

            // This is the key perf step - doing an equivalent loop on a hashtable
            // (for all keys, find keys that start with the input, get the longest)
            // is approx 150x slower than this, for 10000 elements.
        });
    });

});