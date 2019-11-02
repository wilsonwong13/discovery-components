import React, { FC, useState, useEffect, useMemo, useReducer } from 'react';
import { settings } from 'carbon-components';
import get from 'lodash/get';
import { QueryResult } from '@disco-widgets/ibm-watson/discovery/v2';
import { Cell, CellPage, CellField, Page, Bbox } from '../../types';
import CellComponent from './Cell';
import { computeFontFamilyAndWeight } from './utils/fallbackFonts';
import processDoc, { ProcessedDoc, ProcessedBbox } from '../../../../utils/document/processDoc';
import { intersects } from './utils/box';
import shortid from '../../../../utils/shortid';

interface Props {
  /**
   * Contains JSON data of the PDF
   */
  document: QueryResult;
  /**
   * Contains the current page number, default of 1
   */
  currentPage: number;
  /**
   * Zoom factor, where `1` is equal to 100%
   */
  scale?: number;
  /**
   * Check if document is loading
   */
  setLoading: (loading: boolean) => void;
}

type State = {
  pages: PageWithCells[];
  page: PageWithCells;
  pagesHaveFonts: boolean;
};

type Action = {
  type: 'reset' | 'setPages' | 'setCurrentPage' | 'setHaveFonts';
  data?: Partial<State>;
};

const EMPTY_PAGE: PageWithCells = {
  page_number: 0,
  width: 612,
  height: 792,
  origin: 'TopLeft',
  cells: []
};

const INITIAL_STATE = {
  pages: [],
  page: EMPTY_PAGE,
  pagesHaveFonts: false
};

function reducer(state: State, { type, data }: Action): State {
  switch (type) {
    case 'reset':
      return INITIAL_STATE;
    case 'setPages':
      const pages = (data && data.pages) || INITIAL_STATE.pages;
      return {
        ...state,
        pages,
        page: EMPTY_PAGE,
        pagesHaveFonts: false
      };
    case 'setCurrentPage':
      const page = (data && data.page) || INITIAL_STATE.page;
      return { ...state, page };
    case 'setHaveFonts':
      return { ...state, pagesHaveFonts: true };
    default:
      throw new Error();
  }
}

export interface PageWithCells extends Page {
  cells: StyledCell[];
}

export interface StyledCell extends CellPage {
  id: string;
  className: string;
  content: string;
}

export const PdfFallback: FC<Props> = ({ document, currentPage, scale = 1, setLoading }) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { pages, page, pagesHaveFonts } = state;

  // combine text_mappings with text from appropriate field
  useEffect(() => {
    const textMappings = get(document, 'extracted_metadata.text_mappings', []);
    if (!textMappings) {
      return;
    }

    const newPages = [
      EMPTY_PAGE, // add "zeroth" page (unused; makes this array 1-based)
      ...textMappings.pages
    ].map(page => ({ ...page, cells: [] }));

    textMappings.cells.map(({ page, field }: Cell) => {
      const textValue = getFieldText(document, field);
      const content = textValue.substring(field.span[0], field.span[1]);
      const cellPageNumber = page.page_number;
      const cellData = { id: shortid(), bbox: page.bbox, content: content };

      // add new cell to the page array
      newPages[cellPageNumber].cells.push(cellData);
    });

    dispatch({ type: 'setPages', data: { pages: newPages } });
  }, [document]);

  useEffect(() => {
    dispatch({ type: 'setCurrentPage', data: { page: pages[currentPage] || EMPTY_PAGE } });
  }, [pages, currentPage]);

  const [processedDoc, setProcessedDoc] = useState<ProcessedDoc | null>();
  useEffect(() => {
    async function process(): Promise<void> {
      try {
        const doc = await processDoc(document, { bbox: true });
        setProcessedDoc(doc);
      } catch (err) {
        console.warn('Failed to parse document. Styling will be diminished.');
      }
    }

    if (document.html) {
      process();
    }
  }, [document]);

  useEffect(() => {
    if (processedDoc && pages.length > 0) {
      pages.forEach((page, index) => {
        const pageNum = index;
        const bboxes =
          processedDoc.bboxes &&
          processedDoc.bboxes.filter((bbox: ProcessedBbox) => bbox.page == pageNum);

        if (bboxes) {
          page.cells.forEach(cell => {
            const bbox = findMatchingBbox(cell.bbox, bboxes);
            if (bbox) {
              cell.className = bbox.className;
            }
          });
        }
      });
      dispatch({ type: 'setHaveFonts' });
    }
  }, [processedDoc, pages]);

  const doRender = !document.html || (document.html && pagesHaveFonts);

  useEffect(() => {
    setLoading(!doRender);
  }, [doRender, setLoading]);

  const docStyles = useMemo(() => {
    if (doRender && processedDoc && processedDoc.styles) {
      return processStyles(processedDoc.styles);
    }
    return null;
  }, [doRender, processedDoc]);

  return (
    <div
      style={{ transform: `scale(${scale})` }}
      className={`${settings.prefix}--document-preview-pdf-fallback`}
    >
      <>
        <style>{docStyles}</style>
        <svg
          viewBox={`0 0 ${page.width} ${page.height}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {page.cells.map(cell => (
            <CellComponent key={cell.id} page={page} cell={cell} />
          ))}
        </svg>
      </>
    </div>
  );
};

/**
 * Returns true if document can use PdfFallback
 * @param document query result
 * @returns {boolean}
 */
export const supportsPdfFallback = (document: QueryResult): boolean => {
  return !!get(document, 'extracted_metadata.text_mappings');
};

function getFieldText(document: QueryResult, field: CellField): string {
  const [fieldName, fieldProp] = field.name.split('.');
  let fieldValue = document[fieldName];
  if (Array.isArray(fieldValue)) {
    fieldValue = fieldValue[field.index];
  }
  return fieldProp ? fieldValue[fieldProp] : fieldValue;
}

function processStyles(styles: string): string {
  return (
    styles
      // 'pt'->'px', since this works better with diff dimensions of SVG viewport
      .replace(/(\d+)pt;/g, '$1px;')
      // 'color'->'fill', for SVG
      .replace(/(\W)color:/g, '$1fill:')
      // add fallback fonts
      .replace(/font-family:\s*([^;]+)/g, (_, p1) => {
        const { fontFamily, fontWeight } = computeFontFamilyAndWeight(p1);
        let res = `font-family: ${fontFamily}`;
        if (fontWeight !== 400) {
          res += `; font-weight: ${fontWeight}`;
        }
        return res;
      })
  );
}

/**
 *
 * @param cellBbox box data in style [left, top, right, bottom]
 * @param docBboxes document box data in style {x, y, width, height}
 */
function findMatchingBbox(cellBbox: Bbox, docBboxes: ProcessedBbox[]): ProcessedBbox | undefined {
  return docBboxes.find(docBox => {
    const { left: leftB, top: topB, right: rightB, bottom: bottomB } = docBox;
    return intersects(cellBbox, [leftB, topB, rightB, bottomB]);
  });
}

export default PdfFallback;
