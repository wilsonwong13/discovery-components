import React from 'react';
import { storiesOf } from '@storybook/react';
import { withKnobs, text, object, boolean, number } from '@storybook/addon-knobs/react';
import { SearchRefinements } from './SearchRefinements';
import { refinementsQueryResponse } from './fixtures/refinementsQueryResponse';
import collectionsResponse from './fixtures/collectionsResponse';
import aggregationComponentSettingsResponse from './fixtures/componentSettingsResponse';
import { StoryWrapper, DummySearchClient } from '../../utils/storybookUtils';
import { createDummyResponsePromise } from '../../utils/testingUtils';
import { DiscoverySearch, DiscoverySearchProps } from '../DiscoverySearch/DiscoverySearch';
import DiscoveryV2 from '@disco-widgets/ibm-watson/discovery/v2';
import { action } from '@storybook/addon-actions';
import defaultMessages from './messages';

export const props = () => ({
  showCollections: boolean('Show collection refinements', false),
  showSuggestedRefinements: boolean('Show suggested refinements', false),
  collapsedRefinementsCount: number('Number of refinement terms to show when list is collapsed', 5),
  messages: object('I18n messages', defaultMessages),
  componentSettingsAggregations: object(
    'Aggregation component settings',
    aggregationComponentSettingsResponse.result
  )
});

class DummySearchClientWithQueryAndCollections extends DummySearchClient {
  exampleProps = props();
  query(params: DiscoveryV2.QueryParams): Promise<DiscoveryV2.Response<DiscoveryV2.QueryResponse>> {
    action('query')(params);
    return createDummyResponsePromise(refinementsQueryResponse.result);
  }
  listCollections(
    params: DiscoveryV2.ListCollectionsParams
  ): Promise<DiscoveryV2.Response<DiscoveryV2.ListCollectionsResponse>> {
    action('listCollections')(params);
    return createDummyResponsePromise(collectionsResponse.result);
  }
  getComponentSettings(
    params: DiscoveryV2.GetComponentSettingsParams
  ): Promise<DiscoveryV2.Response<DiscoveryV2.ComponentSettingsResponse>> {
    action('getComponentSettings')(params);
    return createDummyResponsePromise(this.exampleProps.componentSettingsAggregations);
  }
}

const discoverySearchProps = (
  queryParams?: Partial<DiscoveryV2.QueryParams>
): DiscoverySearchProps => ({
  searchClient: new DummySearchClientWithQueryAndCollections(),
  projectId: text('Project ID', 'project-id'),
  overrideQueryParameters: queryParams,
  overrideSearchResults: {
    suggested_refinements: [{ text: 'something else' }, { text: 'this, that, other' }]
  }
});

storiesOf('SearchRefinements', module)
  .addDecorator(withKnobs)
  .add('default', () => {
    const exampleProps = props();
    return (
      <StoryWrapper>
        <DiscoverySearch
          {...discoverySearchProps({
            filter: 'author:"editor","this, that, other",subject:"this | that"'
          })}
        >
          <SearchRefinements {...exampleProps} />
        </DiscoverySearch>
      </StoryWrapper>
    );
  })
  .add('initially selected collection', () => {
    const exampleProps = props();
    return (
      <StoryWrapper>
        <DiscoverySearch {...discoverySearchProps({ collectionIds: ['deadspin9876'] })}>
          <SearchRefinements {...exampleProps} showCollections={true} />
        </DiscoverySearch>
      </StoryWrapper>
    );
  });
