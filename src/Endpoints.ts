type HttpHeaders = Record<string, string>;

type GtfsEndpoint = {
    name: string;
    url: string;
    headers?: HttpHeaders;
};

export const endpoints: GtfsEndpoint[] = [
    {
        name: "sydneycomplete",
        url: "https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs",
    },
    {
        name: "lightrailcbdandsoutheast",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/lightrail/cbdandsoutheast",
    },
    {
        name: "lightrailinnerwest",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/lightrail/innerwest",
    },
    {
        name: "lightrailparramatta",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/lightrail/parramatta",
    },
    {
        name: "lightrailnewcastle",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/lightrail/newcastle",
    },
    {
        name: "ferriessydneyferries",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/ferries/sydneyferries",
    },
    {
        name: "ferriesmff",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/ferries/MFF",
    },
    {
        name: "adelaidemetro",
        headers: { accept: "application/octet-stream" },
        url: "https://gtfs.adelaidemetro.com.au/v1/static/latest/google_transit.zip",
    },
    {
        name: "sydneytrains",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/sydneytrains",
    },
    {
        name: "nswtrains",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/nswtrains",
    },
    {
        name: "sydneybuses",
        url: "https://api.transport.nsw.gov.au/v1/gtfs/schedule/buses",
    },
];

/* "regionbuses/centralwestandorana",
"regionbuses/centralwestandorana2",
"regionbuses/newenglandnorthwest",
"regionbuses/northcoast",
"regionbuses/northcoast2",
"regionbuses/northcoast3",
"regionbuses/riverinamurray",
"regionbuses/riverinamurray2",
"regionbuses/southeasttablelands",
"regionbuses/southeasttablelands2",
"regionbuses/sydneysurrounds",
"regionbuses/newcastlehunter",
"regionbuses/farwest", */
