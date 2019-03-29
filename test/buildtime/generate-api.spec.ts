import { expect } from 'chai';

import { calculateCommonPrefixes } from '../../src/buildtime/generate-apis';
import { objToInput, t } from '../test-helpers';

describe('Common prefixes', () => {
    it('can find a common base for separate subdirectories', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a'],
                'spec2': ['/b']
            })
        ).to.deep.equal(objToInput({
            'example.com/a': 'spec1',
            'example.com/b': 'spec2'
        }));
    });

    it('can find a simple common base for shared paths', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a1', '/a2'],
                'spec2': ['/b']
            })
        ).to.deep.equal(objToInput({
            'example.com/a': 'spec1',
            'example.com/b': 'spec2'
        }));
    });

    it('can find multiple common bases for shared paths', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a1', '/a2', '/a/b', '/b'],
                'spec2': ['/c']
            })
        ).to.deep.equal(objToInput({
            'example.com/a': 'spec1',
            'example.com/b': 'spec1',
            'example.com/c': 'spec2'
        }));
    });

    it('can build common bases with overlapping suffixes', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a/b/1', '/a/b/2'],
                'spec2': ['/a', '/c']
            })
        ).to.deep.equal(objToInput({
            'example.com/a': 'spec2',
            'example.com/a/b/': 'spec1',
            'example.com/c': 'spec2'
        }));
    });

    it('deduplicates results with many conflicting endpoints', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a/1', '/a/1', '/a/2'],
                'spec2': ['/a/1', '/a/2', '/c']
            })
        ).to.deep.equal(objToInput({
            'example.com/a/1': ['spec1', 'spec2'],
            'example.com/a/2': ['spec1', 'spec2'],
            'example.com/c': 'spec2'
        }));
    });

    it('deduplicates results with conflicting wildcard params', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a/1', '/a/{param}', '/a/{param}/b'],
                'spec2': ['/a/1', '/a/2', '/a/{param}', '/c']
            })
        ).to.deep.equal(t([
            [['example.com/a/1'], ['spec1', 'spec2']],
            [['example.com/a/', /^[^/]+/], ['spec1', 'spec2']],
            [['example.com/a/', /^[^/]+/, '/b'], 'spec1'],
            [['example.com/a/2'], 'spec2'],
            [['example.com/c'], 'spec2']
        ]));
    });
});