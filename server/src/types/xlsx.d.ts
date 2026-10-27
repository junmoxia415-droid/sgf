/**
 * Type declarations for xlsx package
 * This is a minimal declaration to support the features we use
 */

declare module 'xlsx' {
  interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }

  interface WorkSheet {
    '!ref'?: string;
    [key: string]: any;
  }

  interface ReadOptions {
    type?: 'buffer' | 'binary' | 'string' | 'file' | 'base64';
    cellDates?: boolean;
    cellNF?: boolean;
    cellText?: boolean;
    cellHTML?: boolean;
    sheetRows?: number | string;
    bookSheets?: number | string;
    bookProps?: boolean;
    bookFiles?: boolean;
    bookVBA?: boolean;
    password?: string;
    WTF?: boolean;
  }

  interface SheetToJsonOptions {
    raw?: boolean;
    result?: any[];
    header?: number | string | string[];
    range?: number | string;
    blankrows?: boolean;
    defval?: any;
    skipHeader?: boolean;
    dateNF?: boolean | string;
    rawNumbers?: boolean;
    FMTXLSX?: boolean;
  }

  function read(data: any, opts?: ReadOptions): WorkBook;
  function readFile(path: string, opts?: ReadOptions): WorkBook;
  
  namespace utils {
    function sheet_to_json(worksheet: WorkSheet, opts?: SheetToJsonOptions): any[];
    function json_to_sheet(data: any[], opts?: any): WorkSheet;
    function aoa_to_sheet(data: any[][], opts?: any): WorkSheet;
    function book_new(): WorkBook;
    function book_append_sheet(workbook: WorkBook, worksheet: WorkSheet, name: string): void;
    function write(workbook: WorkBook, opts?: any): any;
  }

  export = XLSX;
  
  namespace XLSX {
    export function read(data: any, opts?: ReadOptions): WorkBook;
    export function readFile(path: string, opts?: ReadOptions): WorkBook;
    export import utils = utils;
  }
}
