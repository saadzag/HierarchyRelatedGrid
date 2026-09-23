import * as React from "react";

// Minimal inline icons (Fluent style, 20px viewBox) to avoid bundling @fluentui/react-icons.
const icon = (path: string): React.FC =>
    function Icon() {
        return (
            <svg width="1em" height="1em" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d={path} />
            </svg>
        );
    };

export const RefreshIcon = icon(
    "M10 3a7 7 0 1 0 6.93 8.01.5.5 0 1 0-.99-.14A6 6 0 1 1 14.24 5.8L12.5 5.8a.5.5 0 0 0 0 1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-1 0v1.7A6.98 6.98 0 0 0 10 3Z",
);
export const SearchIcon = icon(
    "M8.5 3a5.5 5.5 0 0 1 4.23 9.02l4.12 4.13a.5.5 0 0 1-.63.76l-.07-.06-4.13-4.12A5.5 5.5 0 1 1 8.5 3Zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z",
);
export const DismissIcon = icon(
    "m4.09 4.22.06-.07a.5.5 0 0 1 .63-.06l.07.06L10 9.29l5.15-5.14a.5.5 0 0 1 .63-.06l.07.06c.18.17.2.44.06.63l-.06.07L10.71 10l5.14 5.15c.18.17.2.44.06.63l-.06.07a.5.5 0 0 1-.63.06l-.07-.06L10 10.71l-5.15 5.14a.5.5 0 0 1-.63.06l-.07-.06a.5.5 0 0 1-.06-.63l.06-.07L9.29 10 4.15 4.85a.5.5 0 0 1-.06-.63l.06-.07-.06.07Z",
);
export const ChevronLeftIcon = icon("M12.35 15.85a.5.5 0 0 1-.7 0l-5.5-5.5a.5.5 0 0 1 0-.7l5.5-5.5a.5.5 0 0 1 .7.7L7.21 10l5.14 5.15a.5.5 0 0 1 0 .7Z");
export const ChevronRightIcon = icon("M7.65 4.15a.5.5 0 0 1 .7 0l5.5 5.5a.5.5 0 0 1 0 .7l-5.5 5.5a.5.5 0 0 1-.7-.7L12.79 10 7.65 4.85a.5.5 0 0 1 0-.7Z");
export const ChevronDoubleLeftIcon = icon(
    "M10.35 15.85a.5.5 0 0 1-.7 0l-5.5-5.5a.5.5 0 0 1 0-.7l5.5-5.5a.5.5 0 0 1 .7.7L5.21 10l5.14 5.15a.5.5 0 0 1 0 .7Zm5 0a.5.5 0 0 1-.7 0l-5.5-5.5a.5.5 0 0 1 0-.7l5.5-5.5a.5.5 0 0 1 .7.7L10.21 10l5.14 5.15a.5.5 0 0 1 0 .7Z",
);
