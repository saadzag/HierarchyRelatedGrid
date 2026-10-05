/**
 * UI strings. Values come from the resx file matching the user's UI language
 * (strings/HierarchyRelatedGrid.<lcid>.resx); English is used when a key is missing.
 */
const ENGLISH = {
    Msg_SaveRecord: "Save the record to display the related records of its hierarchy.",
    Msg_InvalidConfig: "Invalid configuration: {0}",
    Msg_Loading: "Loading…",
    Msg_NoName: "(no name)",
    Msg_NoRecords: "No records found.",
    Msg_RecordCountOne: "{0} record",
    Msg_RecordCountMany: "{0} records",
    Msg_RecordCountLimit: "{0}+ records",
    Msg_Page: "Page {0}",
    Msg_PageOf: "Page {0} / {1}",
    Btn_FirstPage: "First page",
    Btn_PreviousPage: "Previous page",
    Btn_NextPage: "Next page",
    Btn_Refresh: "Refresh",
    Btn_ClearSearch: "Clear",
    Search_Placeholder: "Search ({0})",
    Err_ViewNotFound: "View not found or not accessible: {0}",
    Err_Http: "Error {0} while retrieving the records.",
    Err_InvalidXml: "Invalid XML ({0}).",
    Err_NoEntity: "The view has no <entity> element.",
};

export type StringKey = keyof typeof ENGLISH;
export type Translate = (key: StringKey, ...args: (string | number)[]) => string;

function format(text: string, args: (string | number)[]): string {
    return args.reduce<string>((s, arg, i) => s.split(`{${i}}`).join(String(arg)), text);
}

export function createTranslator(resources: ComponentFramework.Resources): Translate {
    return (key, ...args) => {
        let text: string | undefined;
        try {
            text = resources.getString(key);
        } catch {
            text = undefined;
        }
        // getString returns the key itself (or nothing) when the resx has no such entry.
        return format(text && text !== key ? text : ENGLISH[key], args);
    };
}

/** Error carrying a string key, translated where it is displayed. */
export class LocalizedError extends Error {
    constructor(
        public readonly key: StringKey,
        public readonly args: (string | number)[] = [],
    ) {
        super(format(ENGLISH[key], args));
    }
}

export function translateError(e: unknown, t: Translate): string {
    if (e instanceof LocalizedError) {
        return t(e.key, ...e.args);
    }
    return e instanceof Error ? e.message : String(e);
}
