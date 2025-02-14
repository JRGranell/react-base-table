import React from 'react';
import PropTypes from 'prop-types';
import cn from 'classnames';
import memoize from 'memoize-one';
import { Align } from 'react-window';

import GridTable from './GridTable';
import TableHeaderRow from './TableHeaderRow';
import TableRow, { RowKey, RowRendererProps } from './TableRow';
import TableHeaderCell, { TableHeaderCellProps } from './TableHeaderCell';
import TableCell, { TableCellProps } from './TableCell';
import Column, { Alignment, FrozenDirection, ColumnProps } from './Column';
import SortOrder, { SortOrderValue } from './SortOrder';
import ExpandIcon, { ExpandIconProps } from './ExpandIcon';
import SortIndicator, { SortIndicatorProps } from './SortIndicator';
import ColumnResizer from './ColumnResizer';
import ColumnManager from './ColumnManager';
import {
  renderElement,
  normalizeColumns,
  getScrollbarSize as defaultGetScrollbarSize,
  isObjectEqual,
  callOrReturn,
  hasChildren,
  flattenOnKeys,
  cloneArray,
  getValue,
  throttle,
  noop,
} from './utils';

const RESIZE_THROTTLE_WAIT = 50;

// used for memoization
const EMPTY_ARRAY = [] as const;
const getColumns = memoize((columns, children) => columns || normalizeColumns(children));

const getContainerStyle = (width: number, maxWidth: number, height: number): React.CSSProperties => ({
  width,
  maxWidth,
  height,
  overflow: 'hidden',
});

const DEFAULT_COMPONENTS = {
  TableCell,
  TableHeaderCell,
  ExpandIcon,
  SortIndicator,
} as const;

export type DefaultComponents = typeof DEFAULT_COMPONENTS;

//#region Event Payloads
export interface OnScrollProps {
  scrollLeft: number;
  scrollTop: number;
  horizontalScrollDirection: 'forward' | 'backward';
  verticalScrollDirection: 'forward' | 'backward';
  scrollUpdateWasRequested: boolean;
}

export interface OnRowRenderProps {
  overscanStartIndex: number;
  overscanStopIndex: number;
  startIndex: number;
  stopIndex: number;
}
//#endregion

export interface BaseTableProps {
  /**
   * Prefix for table's inner className
   */
  classPrefix?: string;
  /**
   * Class name for the table
   */
  className?: string;
  /**
   * Custom style for the table
   */
  style?: React.CSSProperties;
  /**
   * A collection of Column
   */
  children?: React.ReactNode;
  /**
   * Columns for the table
   */
  columns?: ColumnProps[] | any[];
  /**
   * The data for the table
   */
  data: object[];
  /**
   * The data be frozen to top, `rowIndex` is negative and started from `-1`
   */
  frozenData?: object[];
  /**
   * The key field of each data item
   */
  rowKey: RowKey;
  /**
   * The width of the table
   */
  width: number;
  /**
   * The height of the table, will be ignored if `maxHeight` is set
   */
  height?: number;
  /**
   * The max height of the table, the table's height will auto change when data changes,
   * will turns to vertical scroll if reaches the max height
   */
  maxHeight?: number;
  /**
   * The height of each table row
   */
  rowHeight: number;
  /**
   * The height of the table header, set to 0 to hide the header, could be an array to render multi headers.
   */
  headerHeight: number | number[];
  /**
   * The height of the table footer
   */
  footerHeight?: number;
  /**
   * Whether the width of the columns are fixed or flexible
   */
  fixed?: boolean;
  /**
   * Whether the table is disabled
   */
  disabled?: boolean;
  /**
   * Custom renderer on top of the table component
   */
  overlayRenderer?: React.ReactElement;
  /**
   * Custom renderer when the length of data is 0
   */
  emptyRenderer?: React.ElementType;
  /**
   * Custom footer renderer, available only if `footerHeight` is larger then 0
   */
  footerRenderer?: React.ReactElement;
  /**
   * Custom header renderer
   * The renderer receives props `{ cells, columns, headerIndex }`
   */
  headerRenderer?: React.ElementType<{ cells: any; columns: any[]; headerIndex: number }>;
  /**
   * Custom row renderer
   * The renderer receives props `{ isScrolling, cells, columns, rowData, rowIndex, depth }`
   */
  rowRenderer?: React.ElementType<RowRendererProps>;
  /**
   * Class name for the table header, could be a callback to return the class name
   * The callback is of the shape of `({ columns, headerIndex }) => string`
   */
  headerClassName?: ((args: { columns: any[]; headerIndex: number }) => string) | string;
  /**
   * Class name for the table row, could be a callback to return the class name
   * The callback is of the shape of `({ columns, rowData, rowIndex }) => string`
   */
  rowClassName?: ((args: { columns: any[]; rowData: any; rowIndex: number }) => string) | string;
  /**
   * Extra props applied to header element
   * The handler is of the shape of `({ columns, headerIndex }) object`
   */
  headerProps?: ((args: { columns: any[]; headerIndex: number }) => object) | object;
  /**
   * Extra props applied to header cell element
   * The handler is of the shape of `({ columns, column, columnIndex, headerIndex }) => object`
   */
  headerCellProps?:
    | ((args: { columns: any[]; column: any; columnIndex: number; headerIndex: number }) => object)
    | object;
  /**
   * Extra props applied to row element
   * The handler is of the shape of `({ columns, rowData, rowIndex }) => object`
   */
  rowProps?: ((args: { columns: any[]; rowData: any; rowIndex: number }) => object) | object;
  /**
   * Extra props applied to row cell element
   * The handler is of the shape of `({ columns, column, columnIndex, rowData, rowIndex }) => object`
   */
  cellProps?:
    | ((args: { columns: any; column: any; columnIndex: number; rowData: any; rowIndex: number }) => object)
    | object;
  /**
   * Extra props applied to ExpandIcon component
   * The handler is of the shape of `({ rowData, rowIndex, depth, expandable, expanded }) => object`
   */
  expandIconProps?:
    | ((args: { rowData: any; rowIndex: number; depth: any; expandable: boolean; expanded: boolean }) => object)
    | object;
  /**
   * The key for the expand column which render the expand icon if the data is a tree
   */
  expandColumnKey?: string;
  /**
   * Default expanded row keys when initialize the table
   */
  defaultExpandedRowKeys?: (string | number)[];
  /**
   * Controlled expanded row keys
   */
  expandedRowKeys?: (string | number)[];
  /**
   * A callback function when expand or collapse a tree node
   * The handler is of the shape of `({ expanded, rowData, rowIndex, rowKey }) => *`
   */
  onRowExpand?: (args: { expanded: boolean; rowData: any; rowIndex: number; rowKey: number | string }) => void;
  /**
   * A callback function when the expanded row keys changed
   * The handler is of the shape of `(expandedRowKeys) => *`
   */
  onExpandedRowsChange?: (expandedRowKeys: (string | number)[]) => void;
  /**
   * The sort state for the table, will be ignored if `sortState` is set
   */
  sortBy?: {
    /**
     * Sort key
     */
    key: string;
    /**
     * Sort order
     */
    order: SortOrderValue;
  };
  /**
   * Multiple columns sort state for the table
   *
   * example:
   * ```js
   * {
   *   'column-0': SortOrder.ASC,
   *   'column-1': SortOrder.DESC,
   * }
   * ```
   */
  sortState?: { [key: string]: SortOrderValue };
  /**
   * A callback function for the header cell click event
   * The handler is of the shape of `({ column, key, order }) => *`
   */
  onColumnSort?: (args: { column: any; key: string; order: SortOrderValue }) => void;
  /**
   * A callback function when resizing the column width
   * The handler is of the shape of `({ column, width }) => *`
   */
  onColumnResize?: (args: { column: any; width: number }) => void;
  /**
   * A callback function when resizing the column width ends
   * The handler is of the shape of `({ column, width }) => *`
   */
  onColumnResizeEnd?: (args: { column: any; width: number }) => void;
  /**
   * Adds an additional isScrolling parameter to the row renderer.
   * This parameter can be used to show a placeholder row while scrolling.
   */
  useIsScrolling?: boolean;
  /**
   * Number of rows to render above/below the visible bounds of the list
   */
  overscanRowCount?: number;
  /**
   * Custom scrollbar size measurement
   */
  getScrollbarSize?: () => number;
  /**
   * A callback function when scrolling the table
   * The handler is of the shape of `({ scrollLeft, scrollTop, horizontalScrollDirection, verticalScrollDirection, scrollUpdateWasRequested }) => *`
   *
   * `scrollLeft` and `scrollTop` are numbers.
   *
   * `horizontalDirection` and `verticalDirection` are either `forward` or `backward`.
   *
   * `scrollUpdateWasRequested` is a boolean. This value is true if the scroll was caused by `scrollTo*`,
   * and false if it was the result of a user interaction in the browser.
   */
  onScroll?: (args: OnScrollProps) => void;
  /**
   * A callback function when scrolling the table within `onEndReachedThreshold` of the bottom
   * The handler is of the shape of `({ distanceFromEnd }) => *`
   */
  onEndReached?: (args: { distanceFromEnd: number }) => void;
  /**
   * Threshold in pixels for calling `onEndReached`.
   */
  onEndReachedThreshold?: number;
  /**
   * A callback function with information about the slice of rows that were just rendered
   * The handler is of the shape of `({ overscanStartIndex, overscanStopIndex, startIndex， stopIndex }) => *`
   */
  onRowsRendered?: (args: OnRowRenderProps) => void;
  /**
   * A callback function when the scrollbar presence state changed
   * The handler is of the shape of `({ size, vertical, horizontal }) => *`
   */
  onScrollbarPresenceChange?: (args: { size: any; vertical: any; horizontal: any }) => void;
  /**
   * A object for the row event handlers
   * Each of the keys is row event name, like `onClick`, `onDoubleClick` and etc.
   * Each of the handlers is of the shape of `({ rowData, rowIndex, rowKey, event }) => object`
   */
  rowEventHandlers?: {
    [key: string]: (args: { rowData: any; rowIndex: number; rowKey: number | string; event: any }) => any;
  };

  /**
   * A object for the custom components, like `ExpandIcon` and `SortIndicator`
   */
  components?: Partial<{
    TableCell: React.ReactElement<TableCellProps>;
    TableHeaderCell: React.ReactElement<TableHeaderCellProps>;
    ExpandIcon: React.ReactElement<ExpandIconProps>;
    SortIndicator: React.ReactElement<SortIndicatorProps>;
  }>;
}

interface BaseTableState {
  scrollbarSize: number;
  hoveredRowKey: RowKey | null;
  resizingKey: null;
  resizingWidth: number;
  expandedRowKeys: RowKey[];
}

/**
 * React table component
 */
export default class BaseTable extends React.PureComponent<BaseTableProps, BaseTableState> {
  public static readonly Column = Column;
  public static readonly PlaceholderKey = ColumnManager.PlaceholderKey;

  static defaultProps = {
    classPrefix: 'BaseTable',
    rowKey: 'id',
    data: [],
    frozenData: [],
    fixed: false,
    headerHeight: 50,
    rowHeight: 50,
    footerHeight: 0,
    defaultExpandedRowKeys: [],
    sortBy: {},
    useIsScrolling: false,
    overscanRowCount: 1,
    onEndReachedThreshold: 500,
    getScrollbarSize: defaultGetScrollbarSize,

    onScroll: noop,
    onRowsRendered: noop,
    onScrollbarPresenceChange: noop,
    onRowExpand: noop,
    onExpandedRowsChange: noop,
    onColumnSort: noop,
    onColumnResize: noop,
    onColumnResizeEnd: noop,
  };

  static propTypes = {
    /**
     * Prefix for table's inner className
     */
    classPrefix: PropTypes.string,
    /**
     * Class name for the table
     */
    className: PropTypes.string,
    /**
     * Custom style for the table
     */
    style: PropTypes.object,
    /**
     * A collection of Column
     */
    children: PropTypes.node,
    /**
     * Columns for the table
     */
    columns: PropTypes.arrayOf(PropTypes.shape(Column.propTypes)),
    /**
     * The data for the table
     */
    data: PropTypes.arrayOf(PropTypes.object).isRequired,
    /**
     * The data be frozen to top, `rowIndex` is negative and started from `-1`
     */
    frozenData: PropTypes.arrayOf(PropTypes.object),
    /**
     * The key field of each data item
     */
    rowKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    /**
     * The width of the table
     */
    width: PropTypes.number.isRequired,
    /**
     * The height of the table, will be ignored if `maxHeight` is set
     */
    height: PropTypes.number,
    /**
     * The max height of the table, the table's height will auto change when data changes,
     * will turns to vertical scroll if reaches the max height
     */
    maxHeight: PropTypes.number,
    /**
     * The height of each table row
     */
    rowHeight: PropTypes.number.isRequired,
    /**
     * The height of the table header, set to 0 to hide the header, could be an array to render multi headers.
     */
    headerHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.arrayOf(PropTypes.number)]).isRequired,
    /**
     * The height of the table footer
     */
    footerHeight: PropTypes.number,
    /**
     * Whether the width of the columns are fixed or flexible
     */
    fixed: PropTypes.bool,
    /**
     * Whether the table is disabled
     */
    disabled: PropTypes.bool,
    /**
     * Custom renderer on top of the table component
     */
    overlayRenderer: PropTypes.oneOfType([PropTypes.func, PropTypes.element]),
    /**
     * Custom renderer when the length of data is 0
     */
    emptyRenderer: PropTypes.oneOfType([PropTypes.func, PropTypes.element]),
    /**
     * Custom footer renderer, available only if `footerHeight` is larger then 0
     */
    footerRenderer: PropTypes.oneOfType([PropTypes.func, PropTypes.element]),
    /**
     * Custom header renderer
     * The renderer receives props `{ cells, columns, headerIndex }`
     */
    headerRenderer: PropTypes.oneOfType([PropTypes.func, PropTypes.element]),
    /**
     * Custom row renderer
     * The renderer receives props `{ isScrolling, cells, columns, rowData, rowIndex, depth }`
     */
    rowRenderer: PropTypes.oneOfType([PropTypes.func, PropTypes.element]),
    /**
     * Class name for the table header, could be a callback to return the class name
     * The callback is of the shape of `({ columns, headerIndex }) => string`
     */
    headerClassName: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    /**
     * Class name for the table row, could be a callback to return the class name
     * The callback is of the shape of `({ columns, rowData, rowIndex }) => string`
     */
    rowClassName: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    /**
     * Extra props applied to header element
     * The handler is of the shape of `({ columns, headerIndex }) object`
     */
    headerProps: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
    /**
     * Extra props applied to header cell element
     * The handler is of the shape of `({ columns, column, columnIndex, headerIndex }) => object`
     */
    headerCellProps: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
    /**
     * Extra props applied to row element
     * The handler is of the shape of `({ columns, rowData, rowIndex }) => object`
     */
    rowProps: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
    /**
     * Extra props applied to row cell element
     * The handler is of the shape of `({ columns, column, columnIndex, rowData, rowIndex }) => object`
     */
    cellProps: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
    /**
     * Extra props applied to ExpandIcon component
     * The handler is of the shape of `({ rowData, rowIndex, depth, expandable, expanded }) => object`
     */
    expandIconProps: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
    /**
     * The key for the expand column which render the expand icon if the data is a tree
     */
    expandColumnKey: PropTypes.string,
    /**
     * Default expanded row keys when initialize the table
     */
    defaultExpandedRowKeys: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
    /**
     * Controlled expanded row keys
     */
    expandedRowKeys: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
    /**
     * A callback function when expand or collapse a tree node
     * The handler is of the shape of `({ expanded, rowData, rowIndex, rowKey }) => *`
     */
    onRowExpand: PropTypes.func,
    /**
     * A callback function when the expanded row keys changed
     * The handler is of the shape of `(expandedRowKeys) => *`
     */
    onExpandedRowsChange: PropTypes.func,
    /**
     * The sort state for the table, will be ignored if `sortState` is set
     */
    sortBy: PropTypes.shape({
      /**
       * Sort key
       */
      key: PropTypes.string,
      /**
       * Sort order
       */
      order: PropTypes.oneOf([SortOrder.ASC, SortOrder.DESC]),
    }),
    /**
     * Multiple columns sort state for the table
     *
     * example:
     * ```js
     * {
     *   'column-0': SortOrder.ASC,
     *   'column-1': SortOrder.DESC,
     * }
     * ```
     */
    sortState: PropTypes.object,
    /**
     * A callback function for the header cell click event
     * The handler is of the shape of `({ column, key, order }) => *`
     */
    onColumnSort: PropTypes.func,
    /**
     * A callback function when resizing the column width
     * The handler is of the shape of `({ column, width }) => *`
     */
    onColumnResize: PropTypes.func,
    /**
     * A callback function when resizing the column width ends
     * The handler is of the shape of `({ column, width }) => *`
     */
    onColumnResizeEnd: PropTypes.func,
    /**
     * Adds an additional isScrolling parameter to the row renderer.
     * This parameter can be used to show a placeholder row while scrolling.
     */
    useIsScrolling: PropTypes.bool,
    /**
     * Number of rows to render above/below the visible bounds of the list
     */
    overscanRowCount: PropTypes.number,
    /**
     * Custom scrollbar size measurement
     */
    getScrollbarSize: PropTypes.func,
    /**
     * A callback function when scrolling the table
     * The handler is of the shape of `({ scrollLeft, scrollTop, horizontalScrollDirection, verticalScrollDirection, scrollUpdateWasRequested }) => *`
     *
     * `scrollLeft` and `scrollTop` are numbers.
     *
     * `horizontalDirection` and `verticalDirection` are either `forward` or `backward`.
     *
     * `scrollUpdateWasRequested` is a boolean. This value is true if the scroll was caused by `scrollTo*`,
     * and false if it was the result of a user interaction in the browser.
     */
    onScroll: PropTypes.func,
    /**
     * A callback function when scrolling the table within `onEndReachedThreshold` of the bottom
     * The handler is of the shape of `({ distanceFromEnd }) => *`
     */
    onEndReached: PropTypes.func,
    /**
     * Threshold in pixels for calling `onEndReached`.
     */
    onEndReachedThreshold: PropTypes.number,
    /**
     * A callback function with information about the slice of rows that were just rendered
     * The handler is of the shape of `({ overscanStartIndex, overscanStopIndex, startIndex， stopIndex }) => *`
     */
    onRowsRendered: PropTypes.func,
    /**
     * A callback function when the scrollbar presence state changed
     * The handler is of the shape of `({ size, vertical, horizontal }) => *`
     */
    onScrollbarPresenceChange: PropTypes.func,
    /**
     * A object for the row event handlers
     * Each of the keys is row event name, like `onClick`, `onDoubleClick` and etc.
     * Each of the handlers is of the shape of `({ rowData, rowIndex, rowKey, event }) => object`
     */
    rowEventHandlers: PropTypes.object,
    /**
     * A object for the custom components, like `ExpandIcon` and `SortIndicator`
     */
    components: PropTypes.shape({
      TableCell: PropTypes.func,
      TableHeaderCell: PropTypes.func,
      ExpandIcon: PropTypes.func,
      SortIndicator: PropTypes.func,
    }),
  };

  columnManager: ColumnManager;
  _getLeftTableContainerStyle: typeof getContainerStyle;
  _getRightTableContainerStyle: typeof getContainerStyle;
  _flattenOnKeys: (tree: any, keys: any, dataKey: any) => any;
  _resetColumnManager: (columns: any, fixed: any) => void;
  _depthMap: any;
  _scroll: { scrollLeft: number; scrollTop: number };
  _scrollHeight: number;
  _lastScannedRowIndex: number;
  _hasDataChangedSinceEndReached: boolean;
  _data: any;
  _scrollbarPresenceChanged: boolean;
  _verticalScrollbarSize: number;
  _horizontalScrollbarSize: number;

  tableNode: HTMLDivElement | null = null;
  table: GridTable<any> | null = null;
  leftTable: GridTable<any> | null = null;
  rightTable: GridTable<any> | null = null;

  constructor(props: Readonly<BaseTableProps>) {
    super(props);

    const { columns, children, defaultExpandedRowKeys } = props;

    this.state = {
      scrollbarSize: 0,
      hoveredRowKey: null,
      resizingKey: null,
      resizingWidth: 0,
      expandedRowKeys: cloneArray(defaultExpandedRowKeys!),
    };
    this.columnManager = new ColumnManager(getColumns(columns, children), props.fixed);

    this._setContainerRef = this._setContainerRef.bind(this);
    this._setMainTableRef = this._setMainTableRef.bind(this);
    this._setLeftTableRef = this._setLeftTableRef.bind(this);
    this._setRightTableRef = this._setRightTableRef.bind(this);

    this.renderExpandIcon = this.renderExpandIcon.bind(this);
    this.renderRow = this.renderRow.bind(this);
    this.renderRowCell = this.renderRowCell.bind(this);
    this.renderHeader = this.renderHeader.bind(this);
    this.renderHeaderCell = this.renderHeaderCell.bind(this);

    this._handleScroll = this._handleScroll.bind(this);
    this._handleVerticalScroll = this._handleVerticalScroll.bind(this);
    this._handleRowsRendered = this._handleRowsRendered.bind(this);
    this._handleRowHover = this._handleRowHover.bind(this);
    this._handleRowExpand = this._handleRowExpand.bind(this);
    this._handleColumnResize = throttle(this._handleColumnResize.bind(this), RESIZE_THROTTLE_WAIT);
    this._handleColumnResizeStart = this._handleColumnResizeStart.bind(this);
    this._handleColumnResizeStop = this._handleColumnResizeStop.bind(this);
    this._handleColumnSort = this._handleColumnSort.bind(this);

    this._getLeftTableContainerStyle = memoize(getContainerStyle);
    this._getRightTableContainerStyle = memoize(getContainerStyle);
    this._flattenOnKeys = memoize((tree, keys, dataKey) => {
      this._depthMap = {};
      return flattenOnKeys(tree, keys, this._depthMap, dataKey);
    });
    this._resetColumnManager = memoize((columns, fixed) => {
      this.columnManager.reset(columns, fixed);
    }, isObjectEqual);

    this._scroll = { scrollLeft: 0, scrollTop: 0 };
    this._scrollHeight = 0;
    this._lastScannedRowIndex = -1;
    this._hasDataChangedSinceEndReached = true;

    this._data = props.data;
    this._depthMap = {};

    this._horizontalScrollbarSize = 0;
    this._verticalScrollbarSize = 0;
    this._scrollbarPresenceChanged = false;
  }

  /**
   * Get the DOM node of the table
   */
  getDOMNode() {
    return this.tableNode;
  }

  /**
   * Get the column manager
   */
  getColumnManager() {
    return this.columnManager;
  }

  /**
   * Get internal `expandedRowKeys` state
   */
  getExpandedRowKeys() {
    const { expandedRowKeys } = this.props;
    return expandedRowKeys !== undefined ? expandedRowKeys || EMPTY_ARRAY : this.state.expandedRowKeys;
  }

  /**
   * Get the expanded state, fallback to normal state if not expandable.
   */
  getExpandedState() {
    return {
      expandedData: this._data,
      expandedRowKeys: this.getExpandedRowKeys(),
      expandedDepthMap: this._depthMap,
    };
  }

  /**
   * Get the total height of all rows, including expanded rows.
   */
  getTotalRowsHeight() {
    return this._data.length * this.props.rowHeight;
  }

  /**
   * Get the total width of all columns.
   */
  getTotalColumnsWidth() {
    return this.columnManager.getColumnsWidth();
  }

  /**
   * Forcefully re-render the inner Grid component.
   *
   * Calling `forceUpdate` on `Table` may not re-render the inner Grid since it uses `shallowCompare` as a performance optimization.
   * Use this method if you want to manually trigger a re-render.
   * This may be appropriate if the underlying row data has changed but the row sizes themselves have not.
   */
  forceUpdateTable() {
    this.table && this.table.forceUpdateTable();
    this.leftTable && this.leftTable.forceUpdateTable();
    this.rightTable && this.rightTable.forceUpdateTable();
  }

  /**
   * Scroll to the specified offset.
   * Useful for animating position changes.
   *
   * @param {object} offset
   */
  scrollToPosition(offset: { scrollLeft: number; scrollTop: any }) {
    this._scroll = offset as any;

    this.table && this.table.scrollToPosition(offset);
    this.leftTable && this.leftTable.scrollToTop(offset.scrollTop);
    this.rightTable && this.rightTable.scrollToTop(offset.scrollTop);
  }

  /**
   * Scroll to the specified offset vertically.
   *
   * @param {number} scrollTop
   */
  scrollToTop(scrollTop: number) {
    this._scroll.scrollTop = scrollTop;

    this.table && this.table.scrollToPosition(this._scroll);
    this.leftTable && this.leftTable.scrollToTop(scrollTop);
    this.rightTable && this.rightTable.scrollToTop(scrollTop);
  }

  /**
   * Scroll to the specified offset horizontally.
   *
   * @param {number} scrollLeft
   */
  scrollToLeft(scrollLeft: number) {
    this._scroll.scrollLeft = scrollLeft;

    this.table && this.table.scrollToPosition(this._scroll);
  }

  /**
   * Scroll to the specified row.
   * By default, the table will scroll as little as possible to ensure the row is visible.
   * You can control the alignment of the row though by specifying an align property. Acceptable values are:
   *
   * - `auto` (default) - Scroll as little as possible to ensure the row is visible.
   * - `smart` - Same as `auto` if it is less than one viewport away, or it's the same as`center`.
   * - `center` - Center align the row within the table.
   * - `end` - Align the row to the bottom side of the table.
   * - `start` - Align the row to the top side of the table.

   * @param {number} rowIndex
   * @param {string} align
   */
  scrollToRow(rowIndex = 0, align: Align = 'auto') {
    this.table && this.table.scrollToRow(rowIndex, align);
    this.leftTable && this.leftTable.scrollToRow(rowIndex, align);
    this.rightTable && this.rightTable.scrollToRow(rowIndex, align);
  }

  /**
   * Set `expandedRowKeys` manually.
   * This method is available only if `expandedRowKeys` is uncontrolled.
   *
   * @param {array} expandedRowKeys
   */
  setExpandedRowKeys(expandedRowKeys: any) {
    // if `expandedRowKeys` is controlled
    if (this.props.expandedRowKeys !== undefined) return;

    this.setState({
      expandedRowKeys: cloneArray(expandedRowKeys),
    });
  }

  renderExpandIcon({ rowData, rowIndex, depth, onExpand }: any) {
    const { rowKey, expandColumnKey, expandIconProps } = this.props;
    if (!expandColumnKey) return null;

    const expandable = rowIndex >= 0 && hasChildren(rowData);
    const expanded = rowIndex >= 0 && this.getExpandedRowKeys().indexOf(rowData[rowKey]) >= 0;
    const extraProps = callOrReturn(expandIconProps, { rowData, rowIndex, depth, expandable, expanded });
    const ExpandIcon = this._getComponent('ExpandIcon');

    return <ExpandIcon depth={depth} expandable={expandable} expanded={expanded} {...extraProps} onExpand={onExpand} />;
  }

  renderRow({ isScrolling, columns, rowData, rowIndex, style }: any) {
    const { rowClassName, rowRenderer, rowEventHandlers, expandColumnKey } = this.props;

    const rowClass = callOrReturn(rowClassName, { columns, rowData, rowIndex });
    const extraProps = callOrReturn(this.props.rowProps, { columns, rowData, rowIndex });
    const rowKey = rowData[this.props.rowKey];
    const depth = this._depthMap[rowKey] || 0;

    const className = cn(this._prefixClass('row'), rowClass, {
      [this._prefixClass(`row--depth-${depth}`)]: !!expandColumnKey && rowIndex >= 0,
      [this._prefixClass('row--expanded')]: !!expandColumnKey && this.getExpandedRowKeys().indexOf(rowKey) >= 0,
      [this._prefixClass('row--hovered')]: !isScrolling && rowKey === this.state.hoveredRowKey,
      [this._prefixClass('row--frozen')]: depth === 0 && rowIndex < 0,
      [this._prefixClass('row--customized')]: rowRenderer,
    });

    const rowProps: any = {
      ...extraProps,
      role: 'row',
      key: `row-${rowKey}`,
      isScrolling,
      className,
      style,
      columns,
      rowIndex,
      rowData,
      rowKey,
      expandColumnKey,
      depth,
      rowEventHandlers,
      rowRenderer,
      cellRenderer: this.renderRowCell,
      expandIconRenderer: this.renderExpandIcon,
      onRowExpand: this._handleRowExpand,
      // for fixed table, we need to sync the hover state across the inner tables
      onRowHover: this.columnManager.hasFrozenColumns() ? this._handleRowHover : null,
    };

    return <TableRow {...rowProps} />;
  }

  renderRowCell({ isScrolling, columns, column, columnIndex, rowData, rowIndex, expandIcon }: any) {
    if (column[ColumnManager.PlaceholderKey]) {
      return (
        <div
          key={`row-${rowData[this.props.rowKey]}-cell-${column.key}-placeholder`}
          className={this._prefixClass('row-cell-placeholder')}
          style={this.columnManager.getColumnStyle(column.key)}
        />
      );
    }

    const { className, dataKey, dataGetter, cellRenderer } = column;
    const TableCell = this._getComponent('TableCell');

    const cellData = dataGetter
      ? dataGetter({ columns, column, columnIndex, rowData, rowIndex })
      : getValue(rowData, dataKey);
    const cellProps = { isScrolling, cellData, columns, column, columnIndex, rowData, rowIndex, container: this };
    const cell = renderElement(cellRenderer || <TableCell className={this._prefixClass('row-cell-text')} />, cellProps);

    const cellCls = callOrReturn(className, { cellData, columns, column, columnIndex, rowData, rowIndex });
    const cls = cn(this._prefixClass('row-cell'), cellCls, {
      [this._prefixClass('row-cell--align-center')]: column.align === Alignment.CENTER,
      [this._prefixClass('row-cell--align-right')]: column.align === Alignment.RIGHT,
    });

    const extraProps: any = callOrReturn(this.props.cellProps!, { columns, column, columnIndex, rowData, rowIndex });
    const { tagName, ...rest } = extraProps || {};
    const Tag = tagName || 'div';
    return (
      <Tag
        role="gridcell"
        key={`row-${rowData[this.props.rowKey]}-cell-${column.key}`}
        {...rest}
        className={cls}
        style={this.columnManager.getColumnStyle(column.key)}
      >
        {expandIcon}
        {cell}
      </Tag>
    );
  }

  renderHeader({ columns, headerIndex, style }: any) {
    const { headerClassName, headerRenderer } = this.props;

    const headerClass = callOrReturn(headerClassName, { columns, headerIndex });
    const extraProps = callOrReturn(this.props.headerProps, { columns, headerIndex });

    const className = cn(this._prefixClass('header-row'), headerClass, {
      [this._prefixClass('header-row--resizing')]: !!this.state.resizingKey,
      [this._prefixClass('header-row--customized')]: headerRenderer,
    });

    const headerProps = {
      ...extraProps,
      role: 'row',
      key: `header-${headerIndex}`,
      className,
      style,
      columns,
      headerIndex,
      headerRenderer,
      cellRenderer: this.renderHeaderCell,
      expandColumnKey: this.props.expandColumnKey,
      expandIcon: this._getComponent('ExpandIcon'),
    };

    return <TableHeaderRow {...headerProps} />;
  }

  renderHeaderCell({ columns, column, columnIndex, headerIndex, expandIcon }: any) {
    if (column[ColumnManager.PlaceholderKey]) {
      return (
        <div
          key={`header-${headerIndex}-cell-${column.key}-placeholder`}
          className={this._prefixClass('header-cell-placeholder')}
          style={this.columnManager.getColumnStyle(column.key)}
        />
      );
    }

    const { headerClassName, headerRenderer } = column;
    const { sortBy, sortState, headerCellProps } = this.props;
    const TableHeaderCell = this._getComponent('TableHeaderCell');
    const SortIndicator = this._getComponent('SortIndicator');

    const cellProps = { columns, column, columnIndex, headerIndex, container: this };
    const cell = renderElement(
      headerRenderer || <TableHeaderCell className={this._prefixClass('header-cell-text')} />,
      cellProps
    );

    let sorting, sortOrder;

    if (sortState) {
      const order = sortState[column.key];
      sorting = order === SortOrder.ASC || order === SortOrder.DESC;
      sortOrder = sorting ? order : SortOrder.ASC;
    } else {
      sorting = column.key === sortBy!.key;
      sortOrder = sorting ? sortBy!.order : SortOrder.ASC;
    }

    const cellCls = callOrReturn(headerClassName, { columns, column, columnIndex, headerIndex });
    const cls = cn(this._prefixClass('header-cell'), cellCls, {
      [this._prefixClass('header-cell--align-center')]: column.align === Alignment.CENTER,
      [this._prefixClass('header-cell--align-right')]: column.align === Alignment.RIGHT,
      [this._prefixClass('header-cell--sortable')]: column.sortable,
      [this._prefixClass('header-cell--sorting')]: sorting,
      [this._prefixClass('header-cell--resizing')]: column.key === this.state.resizingKey,
    });
    const extraProps: any = callOrReturn(headerCellProps, { columns, column, columnIndex, headerIndex });
    const { tagName, ...rest } = extraProps || {};
    const Tag = tagName || 'div';

    return (
      <Tag
        role="gridcell"
        key={`header-${headerIndex}-cell-${column.key}`}
        onClick={column.sortable ? this._handleColumnSort : null}
        {...rest}
        className={cls}
        style={this.columnManager.getColumnStyle(column.key)}
        data-key={column.key}
      >
        {expandIcon}
        {cell}
        {column.sortable && (
          <SortIndicator
            sortOrder={sortOrder}
            className={cn(this._prefixClass('sort-indicator'), {
              [this._prefixClass('sort-indicator--descending')]: sortOrder === SortOrder.DESC,
            })}
          />
        )}
        {column.resizable && (
          <ColumnResizer
            className={this._prefixClass('column-resizer')}
            column={column}
            onResizeStart={this._handleColumnResizeStart}
            onResizeStop={this._handleColumnResizeStop}
            onResize={this._handleColumnResize}
          />
        )}
      </Tag>
    );
  }

  renderMainTable() {
    const { width, headerHeight, rowHeight, fixed, ...rest } = this.props;
    const height = this._getTableHeight();

    let tableWidth = width - this._verticalScrollbarSize;
    if (fixed) {
      const columnsWidth = this.columnManager.getColumnsWidth();
      // make sure `scrollLeft` is always integer to fix a sync bug when scrolling to end horizontally
      tableWidth = Math.max(Math.round(columnsWidth), tableWidth);
    }
    return (
      <GridTable
        {
          ...(rest as any) // TODO: proper typings
        }
        {...this.state}
        className={this._prefixClass('table-main')}
        ref={this._setMainTableRef}
        data={this._data}
        columns={this.columnManager.getMainColumns()}
        width={width}
        height={height}
        headerHeight={headerHeight}
        rowHeight={rowHeight}
        headerWidth={tableWidth + (fixed ? this._verticalScrollbarSize : 0)}
        bodyWidth={tableWidth}
        headerRenderer={this.renderHeader}
        rowRenderer={this.renderRow}
        onScroll={this._handleScroll}
        onRowsRendered={this._handleRowsRendered}
      />
    );
  }

  renderLeftTable() {
    if (!this.columnManager.hasLeftFrozenColumns()) return null;

    const { width, headerHeight, rowHeight, ...rest } = this.props;

    const containerHeight = this._getFrozenContainerHeight();
    const offset = this._verticalScrollbarSize || 20;
    const columnsWidth = this.columnManager.getLeftFrozenColumnsWidth();

    return (
      <GridTable
        {
          ...(rest as any) // TODO: proper typings
        }
        {...this.state}
        containerStyle={this._getLeftTableContainerStyle(columnsWidth, width, containerHeight)}
        className={this._prefixClass('table-frozen-left')}
        ref={r => this._setLeftTableRef(r)}
        data={this._data}
        columns={this.columnManager.getLeftFrozenColumns()}
        width={columnsWidth + offset}
        height={containerHeight}
        headerHeight={headerHeight}
        rowHeight={rowHeight}
        headerWidth={columnsWidth + offset}
        bodyWidth={columnsWidth + offset}
        headerRenderer={this.renderHeader}
        rowRenderer={this.renderRow}
        onScroll={this._handleVerticalScroll}
        onRowsRendered={noop}
      />
    );
  }

  renderRightTable() {
    if (!this.columnManager.hasRightFrozenColumns()) return null;

    const { width, headerHeight, rowHeight, ...rest } = this.props;

    const containerHeight = this._getFrozenContainerHeight();
    const columnsWidth = this.columnManager.getRightFrozenColumnsWidth();
    const scrollbarWidth = this._verticalScrollbarSize;
    return (
      <GridTable
        {...rest}
        {...this.state}
        containerStyle={this._getLeftTableContainerStyle(columnsWidth + scrollbarWidth, width, containerHeight)}
        className={this._prefixClass('table-frozen-right')}
        ref={r => this._setRightTableRef(r)}
        data={this._data}
        columns={this.columnManager.getRightFrozenColumns()}
        width={columnsWidth + scrollbarWidth}
        height={containerHeight}
        headerHeight={headerHeight}
        rowHeight={rowHeight}
        headerWidth={columnsWidth + scrollbarWidth}
        bodyWidth={columnsWidth}
        headerRenderer={this.renderHeader}
        rowRenderer={this.renderRow}
        onScroll={this._handleVerticalScroll}
        onRowsRendered={noop}
      />
    );
  }

  renderResizingLine() {
    const { width, fixed } = this.props;
    const { resizingKey } = this.state;
    if (!fixed || !resizingKey) return null;

    const columns = this.columnManager.getMainColumns();
    const idx = columns.findIndex((column: { key: null }) => column.key === resizingKey);
    const column = columns[idx];
    const { width: columnWidth, frozen } = column;
    const leftWidth = this.columnManager.recomputeColumnsWidth(columns.slice(0, idx));

    let left = leftWidth + columnWidth;
    if (!frozen) {
      left -= this._scroll.scrollLeft;
    } else if (frozen === FrozenDirection.RIGHT) {
      const rightWidth = this.columnManager.recomputeColumnsWidth(columns.slice(idx + 1));
      if (rightWidth + columnWidth > width - this._verticalScrollbarSize) {
        left = columnWidth;
      } else {
        left = width - this._verticalScrollbarSize - rightWidth;
      }
    }
    const style = {
      left,
      height: this._getTableHeight() - this._horizontalScrollbarSize,
    };
    return <div className={this._prefixClass('resizing-line')} style={style} />;
  }

  renderFooter() {
    const { footerHeight, footerRenderer } = this.props;
    if (footerHeight === 0) return null;
    return (
      <div className={this._prefixClass('footer')} style={{ height: footerHeight }}>
        {renderElement(footerRenderer)}
      </div>
    );
  }

  renderEmptyLayer() {
    const { data, footerHeight, emptyRenderer } = this.props;

    if (data && data.length) return null;
    const headerHeight = this._getHeaderHeight();
    return (
      <div className={this._prefixClass('empty-layer')} style={{ top: headerHeight, bottom: footerHeight }}>
        {renderElement(emptyRenderer)}
      </div>
    );
  }

  renderOverlay() {
    const { overlayRenderer } = this.props;

    return <div className={this._prefixClass('overlay')}>{!!overlayRenderer && renderElement(overlayRenderer)}</div>;
  }

  render() {
    const {
      columns,
      children,
      width,
      fixed,
      data,
      frozenData,
      expandColumnKey,
      disabled,
      className,
      style,
      footerHeight,
      classPrefix,
    } = this.props;

    this._resetColumnManager(getColumns(columns, children), fixed);

    if (expandColumnKey) {
      this._data = this._flattenOnKeys(data, this.getExpandedRowKeys(), this.props.rowKey);
    } else {
      this._data = data;
    }
    // should be after `this._data` assigned
    this._calcScrollbarSizes();

    const containerStyle: React.CSSProperties = {
      ...style,
      width,
      height: this._getTableHeight() + footerHeight!,
      position: 'relative',
    };
    const cls = cn(classPrefix, className, {
      [`${classPrefix}--fixed`]: fixed,
      [`${classPrefix}--expandable`]: !!expandColumnKey,
      [`${classPrefix}--empty`]: data.length === 0,
      [`${classPrefix}--has-frozen-rows`]: frozenData!.length > 0,
      [`${classPrefix}--has-frozen-columns`]: this.columnManager.hasFrozenColumns(),
      [`${classPrefix}--disabled`]: disabled,
    });
    return (
      <div ref={r => this._setContainerRef(r)} className={cls} style={containerStyle}>
        {this.renderFooter()}
        {this.renderMainTable()}
        {this.renderLeftTable()}
        {this.renderRightTable()}
        {this.renderResizingLine()}
        {this.renderEmptyLayer()}
        {this.renderOverlay()}
      </div>
    );
  }

  componentDidMount() {
    const scrollbarSize = this.props.getScrollbarSize!();
    if (scrollbarSize > 0) {
      this.setState({ scrollbarSize });
    }
  }

  componentDidUpdate(prevProps: Readonly<BaseTableProps>) {
    const { data, height, maxHeight } = this.props;
    if (data !== prevProps.data) {
      this._lastScannedRowIndex = -1;
      this._hasDataChangedSinceEndReached = true;
    }

    if (maxHeight !== prevProps.maxHeight || height !== prevProps.height) {
      this._maybeCallOnEndReached();
    }
    this._maybeScrollbarPresenceChange();
  }

  _prefixClass(className: string) {
    return `${this.props.classPrefix}__${className}`;
  }

  _setContainerRef(ref: HTMLDivElement | null) {
    this.tableNode = ref;
  }

  _setMainTableRef(ref: GridTable<any> | null) {
    this.table = ref;
  }

  _setLeftTableRef(ref: GridTable<any> | null) {
    this.leftTable = ref;
  }

  _setRightTableRef(ref: GridTable<any> | null) {
    this.rightTable = ref;
  }

  _getComponent(name: string) {
    if (this.props.components && (this.props.components as any)[name]) {
      return (this.props.components as any)[name];
    }
    return (DEFAULT_COMPONENTS as any)[name];
  }

  _getHeaderHeight() {
    const { headerHeight } = this.props;
    if (Array.isArray(headerHeight)) {
      return headerHeight.reduce((sum, height) => sum + height, 0);
    }
    return headerHeight;
  }

  _getFrozenRowsHeight() {
    const { frozenData, rowHeight } = this.props;
    return frozenData!.length * rowHeight;
  }

  _getTableHeight() {
    const { height, maxHeight, footerHeight } = this.props;
    let tableHeight = height! - footerHeight!;

    if (maxHeight! > 0) {
      const frozenRowsHeight = this._getFrozenRowsHeight();
      const totalRowsHeight = this.getTotalRowsHeight();
      const headerHeight = this._getHeaderHeight();
      const totalHeight = headerHeight + frozenRowsHeight + totalRowsHeight + this._horizontalScrollbarSize;
      tableHeight = Math.min(totalHeight, maxHeight! - footerHeight!);
    }

    return tableHeight;
  }

  _getBodyHeight() {
    return this._getTableHeight() - this._getHeaderHeight() - this._getFrozenRowsHeight();
  }

  _getFrozenContainerHeight() {
    const { maxHeight } = this.props;

    const tableHeight = this._getTableHeight() - (this._data.length > 0 ? this._horizontalScrollbarSize : 0);
    // in auto height mode tableHeight = totalHeight
    if (maxHeight! > 0) return tableHeight;

    const totalHeight = this.getTotalRowsHeight() + this._getHeaderHeight() + this._getFrozenRowsHeight();
    return Math.min(tableHeight, totalHeight);
  }

  _calcScrollbarSizes() {
    const { fixed, width } = this.props;
    const { scrollbarSize } = this.state;

    const totalRowsHeight = this.getTotalRowsHeight();
    const totalColumnsWidth = this.getTotalColumnsWidth();

    const prevHorizontalScrollbarSize = this._horizontalScrollbarSize;
    const prevVerticalScrollbarSize = this._verticalScrollbarSize;

    if (scrollbarSize === 0) {
      this._horizontalScrollbarSize = 0;
      this._verticalScrollbarSize = 0;
    } else {
      // we have to set `this._horizontalScrollbarSize` before calling `this._getBodyHeight`
      if (!fixed || totalColumnsWidth <= width - scrollbarSize) {
        this._horizontalScrollbarSize = 0;
        this._verticalScrollbarSize = totalRowsHeight > this._getBodyHeight() ? scrollbarSize : 0;
      } else {
        if (totalColumnsWidth > width) {
          this._horizontalScrollbarSize = scrollbarSize;
          this._verticalScrollbarSize =
            totalRowsHeight > this._getBodyHeight() - this._horizontalScrollbarSize ? scrollbarSize : 0;
        } else {
          this._horizontalScrollbarSize = 0;
          this._verticalScrollbarSize = 0;
          if (totalRowsHeight > this._getBodyHeight()) {
            this._horizontalScrollbarSize = scrollbarSize;
            this._verticalScrollbarSize = scrollbarSize;
          }
        }
      }
    }

    if (
      prevHorizontalScrollbarSize !== this._horizontalScrollbarSize ||
      prevVerticalScrollbarSize !== this._verticalScrollbarSize
    ) {
      this._scrollbarPresenceChanged = true;
    }
  }

  _maybeScrollbarPresenceChange() {
    if (this._scrollbarPresenceChanged) {
      const { onScrollbarPresenceChange } = this.props;
      this._scrollbarPresenceChanged = false;

      onScrollbarPresenceChange!({
        size: this.state.scrollbarSize,
        horizontal: this._horizontalScrollbarSize > 0,
        vertical: this._verticalScrollbarSize > 0,
      });
    }
  }

  _maybeCallOnEndReached() {
    const { onEndReached, onEndReachedThreshold } = this.props;
    const { scrollTop } = this._scroll;
    const scrollHeight = this.getTotalRowsHeight();
    const clientHeight = this._getBodyHeight();

    if (!onEndReached || !clientHeight || !scrollHeight) return;
    const distanceFromEnd = scrollHeight - scrollTop - clientHeight + this._horizontalScrollbarSize;
    if (
      this._lastScannedRowIndex >= 0 &&
      distanceFromEnd <= onEndReachedThreshold! &&
      (this._hasDataChangedSinceEndReached || scrollHeight !== this._scrollHeight)
    ) {
      this._hasDataChangedSinceEndReached = false;
      this._scrollHeight = scrollHeight;
      onEndReached({ distanceFromEnd });
    }
  }

  _handleScroll(args: OnScrollProps) {
    const lastScrollTop = this._scroll.scrollTop;
    this.scrollToPosition(args);
    this.props.onScroll!(args);

    if (args.scrollTop > lastScrollTop) this._maybeCallOnEndReached();
  }

  _handleVerticalScroll({ scrollTop }: any) {
    const lastScrollTop = this._scroll.scrollTop;
    this.scrollToTop(scrollTop);

    if (scrollTop > lastScrollTop) this._maybeCallOnEndReached();
  }

  _handleRowsRendered(args: OnRowRenderProps) {
    this.props.onRowsRendered!(args);

    if (args.overscanStopIndex > this._lastScannedRowIndex) {
      this._lastScannedRowIndex = args.overscanStopIndex;
      this._maybeCallOnEndReached();
    }
  }

  _handleRowHover({ hovered, rowKey }: any) {
    this.setState({ hoveredRowKey: hovered ? rowKey : null });
  }

  _handleRowExpand({ expanded, rowData, rowIndex, rowKey }: any) {
    const expandedRowKeys = cloneArray(this.getExpandedRowKeys());
    if (expanded) {
      if (!(expandedRowKeys.indexOf(rowKey) >= 0)) expandedRowKeys.push(rowKey);
    } else {
      const index = expandedRowKeys.indexOf(rowKey);
      if (index > -1) {
        expandedRowKeys.splice(index, 1);
      }
    }
    // if `expandedRowKeys` is uncontrolled, update internal state
    if (this.props.expandedRowKeys === undefined) {
      this.setState({ expandedRowKeys });
    }
    this.props.onRowExpand!({ expanded, rowData, rowIndex, rowKey });
    this.props.onExpandedRowsChange!(expandedRowKeys);
  }

  _handleColumnResize({ key }: any, width: any) {
    this.columnManager.setColumnWidth(key, width);
    this.setState({ resizingWidth: width });

    const column = this.columnManager.getColumn(key);
    this.props.onColumnResize!({ column, width });
  }

  _handleColumnResizeStart({ key }: any) {
    this.setState({ resizingKey: key });
  }

  _handleColumnResizeStop() {
    const { resizingKey, resizingWidth } = this.state;
    this.setState({ resizingKey: null, resizingWidth: 0 });

    if (!resizingKey || !resizingWidth) return;

    const column = this.columnManager.getColumn(resizingKey);
    this.props.onColumnResizeEnd!({ column, width: resizingWidth });
  }

  _handleColumnSort(event: { currentTarget: { dataset: { key: any } } }) {
    const key = event.currentTarget.dataset.key;
    const { sortBy, sortState, onColumnSort } = this.props;
    let order: SortOrderValue = SortOrder.ASC;

    if (sortState) {
      order = sortState[key] === SortOrder.ASC ? SortOrder.DESC : SortOrder.ASC;
    } else if (key === sortBy!.key) {
      order = sortBy!.order === SortOrder.ASC ? SortOrder.DESC : SortOrder.ASC;
    }

    const column = this.columnManager.getColumn(key);
    onColumnSort!({ column, key, order });
  }
}
