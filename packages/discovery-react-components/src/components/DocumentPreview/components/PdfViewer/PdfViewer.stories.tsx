import React from 'react';
import { storiesOf } from '@storybook/react';
import { withKnobs, radios, number } from '@storybook/addon-knobs';
import PdfViewer from './PdfViewer';
import { document as doc } from '../../__fixtures__/Art Effects.pdf';
import { nonLatinDoc as nonLatin } from '../../__fixtures__/NonLatin.pdf';

const pageKnob = {
  label: 'Page',
  options: {
    range: true,
    min: 1,
    max: 8,
    step: 1
  },
  defaultValue: 1
};

const zoomKnob = {
  label: 'Zoom',
  options: {
    'Zoom out (50%)': '0.5',
    'Default (100%)': '1',
    'Zoom in (150%)': '1.5'
  },
  defaultValue: '1'
};

storiesOf('DocumentPreview/components/PdfViewer', module)
  .addDecorator(withKnobs)
  .add('default', () => {
    const page = number(pageKnob.label, pageKnob.defaultValue, pageKnob.options);
    const zoom = radios(zoomKnob.label, zoomKnob.options, zoomKnob.defaultValue);
    const scale = parseFloat(zoom);

    return (
      <PdfViewer
        file={doc}
        page={page}
        scale={scale}
        setPageCount={(): void => {}}
        setLoading={(): void => {}}
      />
    );
  })
  .add('Non Latin', () => {
    const page = number(pageKnob.label, pageKnob.defaultValue, pageKnob.options);
    const zoom = radios(zoomKnob.label, zoomKnob.options, zoomKnob.defaultValue);
    const scale = parseFloat(zoom);

    return (
      <PdfViewer
        file={nonLatin}
        page={page}
        scale={scale}
        setPageCount={(): void => {}}
        setLoading={(): void => {}}
      />
    );
  });
