import React, { FC } from 'react';
import DiscoveryV2 from '@disco-widgets/ibm-watson/discovery/v2';
import { render, fireEvent, waitForDomChange, wait } from '@testing-library/react';
import { createDummyResponsePromise, createDummyResponse } from '../testingUtils';
import {
  useSearchResultsApi,
  SearchResponseStore,
  useFetchDocumentsApi,
  FetchDocumentsResponseStore
} from '../useDataApi';
import { SearchClient } from '../../components/DiscoverySearch/types';

class BaseSearchClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async query(): Promise<any> {
    return createDummyResponsePromise({});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getAutocompletion(): Promise<any> {
    return createDummyResponsePromise({});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async listCollections(): Promise<any> {
    return createDummyResponsePromise({});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getComponentSettings(): Promise<any> {
    return createDummyResponsePromise({});
  }
}

class SingleQueryResultSearchClient extends BaseSearchClient {
  public async query(): Promise<any> {
    return createDummyResponsePromise({ matching_results: 1 });
  }
}

class ErrorSearchClient extends BaseSearchClient {
  public async query(): Promise<any> {
    return Promise.reject();
  }
}

class SlowQueryClient extends BaseSearchClient {
  public async query(): Promise<any> {
    return await new Promise(resolve => {
      setTimeout(() => {
        resolve({ result: { matching_results: 1 } });
      }, 100);
    });
  }
}

interface TestSearchStoreComponentProps {
  searchParameters?: DiscoveryV2.QueryParams;
  searchResults?: DiscoveryV2.QueryResponse;
  searchClient?: SearchClient;
  callback?: (result: DiscoveryV2.QueryResponse) => void;
}

const TestSearchStoreComponent: FC<TestSearchStoreComponentProps> = ({
  searchParameters = {
    projectId: ''
  },
  searchResults = null,
  searchClient = new BaseSearchClient(),
  callback
}) => {
  const [searchResponseStore, searchResponseApi] = useSearchResultsApi(
    searchParameters,
    searchResults,
    searchClient
  );

  return (
    <>
      <button
        data-testid="performSearch"
        onClick={() => searchResponseApi.performSearch(callback)}
      />
      <button
        data-testid="setSearchResponse"
        onClick={() => searchResponseApi.setSearchResponse({ matching_results: 2 })}
      />
      <button
        data-testid="setSearchParameters"
        onClick={() => searchResponseApi.setSearchParameters({ projectId: 'set' })}
      />
      <div data-testid="searchResponseStore">{JSON.stringify(searchResponseStore)}</div>
    </>
  );
};

describe('useSearchResultsApi', () => {
  describe('initial state', () => {
    test('can initialize reducer state', () => {
      const result = render(<TestSearchStoreComponent />);
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );

      expect(json.isError).toEqual(false);
      expect(json.isLoading).toEqual(false);
    });

    test('can set initial search parameters', () => {
      const searchParameters = {
        projectId: 'foo',
        naturalLanguageQuery: 'bar'
      };
      const result = render(<TestSearchStoreComponent searchParameters={searchParameters} />);
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );

      expect(json.parameters).toEqual(
        expect.objectContaining({
          projectId: 'foo',
          naturalLanguageQuery: 'bar'
        })
      );
    });

    test('can set initial search results', () => {
      const searchResults = {
        matching_results: 1
      };
      const result = render(<TestSearchStoreComponent searchResults={searchResults} />);
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );

      expect(json.data).toEqual(
        expect.objectContaining({
          matching_results: 1
        })
      );
    });
  });

  describe('when calling performSearch', () => {
    test('it sets loading state', () => {
      const result = render(
        <TestSearchStoreComponent searchClient={new SingleQueryResultSearchClient()} />
      );
      const performSearchButton = result.getByTestId('performSearch');

      fireEvent.click(performSearchButton);
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );
      expect(json.isLoading).toEqual(true);
    });

    test('it sets error state', async () => {
      const result = render(<TestSearchStoreComponent searchClient={new ErrorSearchClient()} />);
      const performSearchButton = result.getByTestId('performSearch');

      fireEvent.click(performSearchButton);
      await waitForDomChange({ container: result.container });
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );
      expect(json.isError).toEqual(true);
    });

    test('sets the search results', async () => {
      const result = render(
        <TestSearchStoreComponent searchClient={new SingleQueryResultSearchClient()} />
      );
      const performSearchButton = result.getByTestId('performSearch');
      fireEvent.click(performSearchButton);
      await waitForDomChange({ container: result.container });
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );

      expect(json.data).toEqual(
        expect.objectContaining({
          matching_results: 1
        })
      );
    });

    describe('callback', () => {
      test('calls callback method with results', async () => {
        const callbackMock = jest.fn();
        const result = render(<TestSearchStoreComponent callback={callbackMock} />);
        const performSearchButton = result.getByTestId('performSearch');
        fireEvent.click(performSearchButton);
        await waitForDomChange({ container: result.container });

        expect(callbackMock).toHaveBeenCalledWith({});
      });
    });

    describe('cancellation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let consoleError: jest.SpyInstance<any, any>;
      beforeAll(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      });

      afterAll(() => {
        consoleError.mockRestore();
      });

      afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
      });

      test('does not attempt to set state when unmounted (to prevent memory leaks)', () => {
        jest.useFakeTimers();
        const result = render(<TestSearchStoreComponent searchClient={new SlowQueryClient()} />);
        const { unmount, getByTestId } = result;
        const performSearchButton = getByTestId('performSearch');

        fireEvent.click(performSearchButton);
        unmount();

        jest.runOnlyPendingTimers();
        expect(consoleError).not.toHaveBeenCalled();
      });
    });

    describe('freshest data', () => {
      const SLOW_TOTAL = 2;
      const FAST_TOTAL = 1;
      class TwoRequestsClient extends BaseSearchClient {
        public async query(searchParams?: DiscoveryV2.QueryParams): Promise<any> {
          if (searchParams && searchParams.projectId === 'set') {
            return createDummyResponse({ matching_results: FAST_TOTAL });
          } else {
            return new Promise(resolve => {
              setTimeout(() => {
                resolve({ result: { matching_results: SLOW_TOTAL } });
              }, 100);
            });
          }
        }
      }
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      test('retrieves the latest request', async () => {
        jest.useFakeTimers();
        const searchParameters = {
          projectId: 'foo'
        };
        const { getByTestId } = render(
          <TestSearchStoreComponent
            searchParameters={searchParameters}
            searchClient={new TwoRequestsClient()}
          />
        );
        const performSearchButton = getByTestId('performSearch');
        const setSearchParametersButton = getByTestId('setSearchParameters');

        fireEvent.click(performSearchButton);
        fireEvent.click(performSearchButton);
        fireEvent.click(performSearchButton);
        fireEvent.click(setSearchParametersButton);
        fireEvent.click(performSearchButton);
        jest.runAllTimers();
        await wait(() => {
          const json: SearchResponseStore = JSON.parse(
            getByTestId('searchResponseStore').textContent || '{}'
          );
          if (json && json.data && json.data.matching_results !== 1) {
            throw new Error();
          }
        });

        const json: SearchResponseStore = JSON.parse(
          getByTestId('searchResponseStore').textContent || '{}'
        );

        expect(json.data).toEqual(
          expect.objectContaining({
            matching_results: FAST_TOTAL
          })
        );
      });
    });
  });

  describe('when calling setSearchResponse', () => {
    test('it sets search response', () => {
      const result = render(<TestSearchStoreComponent searchClient={new BaseSearchClient()} />);
      const setSearchResponseButton = result.getByTestId('setSearchResponse');

      fireEvent.click(setSearchResponseButton);
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );
      expect(json.data).toEqual(
        expect.objectContaining({
          matching_results: 2
        })
      );
    });
  });

  describe('when calling setSearchParameters', () => {
    test('it sets search parameters', () => {
      const result = render(<TestSearchStoreComponent searchClient={new BaseSearchClient()} />);
      const setSearchParametersButton = result.getByTestId('setSearchParameters');

      fireEvent.click(setSearchParametersButton);
      const json: SearchResponseStore = JSON.parse(
        result.getByTestId('searchResponseStore').textContent || '{}'
      );
      expect(json.parameters).toEqual(
        expect.objectContaining({
          projectId: 'set'
        })
      );
    });
  });
});

describe('useFetchDocumentsApi', () => {
  interface TestFetchDocumentsStoreComponentProps {
    searchParameters?: DiscoveryV2.QueryParams;
    searchClient?: SearchClient;
    callback?: (result: DiscoveryV2.QueryResponse) => void;
  }

  const TestFetchDocumentsStoreComponent: FC<TestFetchDocumentsStoreComponentProps> = ({
    searchParameters = {
      projectId: ''
    },
    searchClient = new BaseSearchClient(),
    callback = () => {}
  }) => {
    const [fetchDocumentsStore, fetchDocumentsApi] = useFetchDocumentsApi(
      searchParameters,
      searchClient
    );

    return (
      <>
        <button
          data-testid="fetchDocuments"
          onClick={e => fetchDocumentsApi.fetchDocuments(e.currentTarget.value || '', callback)}
        />
        <div data-testid="fetchDocumentsStore">{JSON.stringify(fetchDocumentsStore)}</div>
      </>
    );
  };

  describe('initial state', () => {
    test('can initialize reducer state', () => {
      const result = render(<TestFetchDocumentsStoreComponent />);
      const json: FetchDocumentsResponseStore = JSON.parse(
        result.getByTestId('fetchDocumentsStore').textContent || '{}'
      );

      expect(json.isError).toEqual(false);
      expect(json.isLoading).toEqual(false);
    });
  });

  describe('when calling fetchDocuments', () => {
    test('it sets loading state', () => {
      const result = render(
        <TestFetchDocumentsStoreComponent searchClient={new SingleQueryResultSearchClient()} />
      );
      const fetchDocumentsButton = result.getByTestId('fetchDocuments');

      fireEvent.click(fetchDocumentsButton);
      const json: FetchDocumentsResponseStore = JSON.parse(
        result.getByTestId('fetchDocumentsStore').textContent || '{}'
      );
      expect(json.isLoading).toEqual(true);
    });

    test('it sets error state', async () => {
      const result = render(
        <TestFetchDocumentsStoreComponent searchClient={new ErrorSearchClient()} />
      );
      const fetchDocumentsButton = result.getByTestId('fetchDocuments');

      fireEvent.click(fetchDocumentsButton);
      await waitForDomChange({ container: result.container });
      const json: FetchDocumentsResponseStore = JSON.parse(
        result.getByTestId('fetchDocumentsStore').textContent || '{}'
      );
      expect(json.isError).toEqual(true);
    });

    test('set filter with initial search parameters', () => {
      const checkParametersMock = jest.fn();
      class ParameterTrackingSearchClient extends BaseSearchClient {
        public async query(searchParams?: DiscoveryV2.QueryParams): Promise<any> {
          checkParametersMock(searchParams);
          return createDummyResponse({});
        }
      }
      const searchParameters = {
        projectId: 'foo',
        returnFields: [],
        aggregation: '',
        passages: {},
        tableResults: {}
      };
      const result = render(
        <TestFetchDocumentsStoreComponent
          searchClient={new ParameterTrackingSearchClient()}
          searchParameters={searchParameters}
        />
      );
      const fetchDocumentsButton = result.getByTestId('fetchDocuments');

      fireEvent.click(fetchDocumentsButton, { target: { value: 'filter_string' } });
      expect(checkParametersMock).toHaveBeenCalledWith({
        projectId: 'foo',
        returnFields: [],
        aggregation: '',
        passages: {},
        tableResults: {},
        filter: 'filter_string'
      });
    });

    describe('callback', () => {
      test('calls callback method with results', async () => {
        const callbackMock = jest.fn();
        const result = render(<TestFetchDocumentsStoreComponent callback={callbackMock} />);
        const fetchDocumentsButton = result.getByTestId('fetchDocuments');

        fireEvent.click(fetchDocumentsButton);
        await waitForDomChange({ container: result.container });

        expect(callbackMock).toHaveBeenCalledWith({});
      });
    });

    describe('cancellation', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let consoleError: jest.SpyInstance<any, any>;
      beforeAll(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      });

      afterAll(() => {
        consoleError.mockRestore();
      });

      afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
      });

      test('does not attempt to set state when unmounted (to prevent memory leaks)', () => {
        jest.useFakeTimers();
        const result = render(
          <TestFetchDocumentsStoreComponent searchClient={new SlowQueryClient()} />
        );
        const { unmount, getByTestId } = result;
        const fetchDocumentsButton = getByTestId('fetchDocuments');

        fireEvent.click(fetchDocumentsButton);
        unmount();

        jest.runOnlyPendingTimers();
        expect(consoleError).not.toHaveBeenCalled();
      });
    });

    describe('freshest data', () => {
      const SLOW_TOTAL = 2;
      const FAST_TOTAL = 1;
      class TwoRequestsClient extends BaseSearchClient {
        public async query(searchParams?: DiscoveryV2.QueryParams): Promise<any> {
          if (searchParams && searchParams.filter === 'fast') {
            return createDummyResponse({ matching_results: FAST_TOTAL });
          } else {
            return new Promise(resolve => {
              setTimeout(() => {
                resolve({ result: { matching_results: SLOW_TOTAL } });
              }, 100);
            });
          }
        }
      }
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      test('retrieves the latest request', async () => {
        jest.useFakeTimers();
        const searchParameters = {
          projectId: 'foo'
        };
        const { getByTestId } = render(
          <TestFetchDocumentsStoreComponent
            searchParameters={searchParameters}
            searchClient={new TwoRequestsClient()}
          />
        );
        const fetchDocumentsButton = getByTestId('fetchDocuments');

        fireEvent.click(fetchDocumentsButton, { target: { value: 'slow' } });
        fireEvent.click(fetchDocumentsButton, { target: { value: 'slow' } });
        fireEvent.click(fetchDocumentsButton, { target: { value: 'fast' } });
        jest.runAllTimers();
        await wait(() => {
          const json: FetchDocumentsResponseStore = JSON.parse(
            getByTestId('fetchDocumentsStore').textContent || '{}'
          );
          if (json && json.data && json.data.matching_results !== 1) {
            throw new Error();
          }
        });

        const json: FetchDocumentsResponseStore = JSON.parse(
          getByTestId('fetchDocumentsStore').textContent || '{}'
        );

        expect(json.data).toEqual(
          expect.objectContaining({
            matching_results: FAST_TOTAL
          })
        );
      });
    });
  });
});