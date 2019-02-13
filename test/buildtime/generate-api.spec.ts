import { expect } from 'chai';

import { calculateCommonPrefixes } from '../../src/buildtime/generate-apis';

describe('Common prefixes', () => {
    it('can find a common base for separate subdirectories', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a'],
                'spec2': ['/b']
            })
        ).to.deep.equal({
            'example.com/a': 'spec1',
            'example.com/b': 'spec2'
        });
    });

    it('can find a simple common base for shared paths', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a1', '/a2'],
                'spec2': ['/b']
            })
        ).to.deep.equal({
            'example.com/a': 'spec1',
            'example.com/b': 'spec2'
        });
    });

    it('can find multiple common bases for shared paths', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a1', '/a2', '/a/b', '/b'],
                'spec2': ['/c']
            })
        ).to.deep.equal({
            'example.com/a': 'spec1',
            'example.com/b': 'spec1',
            'example.com/c': 'spec2'
        });
    });

    it('can build common bases with overlapping suffixes', () => {
        expect(
            calculateCommonPrefixes('example.com', {
                'spec1': ['/a/b/1', '/a/b/2'],
                'spec2': ['/a', '/c']
            })
        ).to.deep.equal({
            'example.com/a': 'spec2',
            'example.com/a/b/': 'spec1',
            'example.com/c': 'spec2'
        });
    });
});