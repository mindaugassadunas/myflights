# Aloft — ER diagram

Generated from [`web/prisma/schema.prisma`](../web/prisma/schema.prisma). Refresh this diagram whenever the schema changes.

```mermaid
erDiagram
    User ||--o{ Flight       : "owns"
    User ||--o{ Trip         : "owns"
    User ||--o{ EmailImport  : "owns"
    User ||--o{ Account      : "auth"
    User ||--o{ Session      : "sessions"

    Airport       ||--o{ Flight : "departures"
    Airport       ||--o{ Flight : "arrivals"
    Airline       ||--o{ Flight : "operator"
    AircraftType  ||--o{ Flight : "type"
    Aircraft      ||--o{ Flight : "airframe"
    AircraftType  ||--o{ Aircraft : "typecodes"
    Trip          ||--o{ Flight : "groups"
    Flight        ||--o| Track  : "trajectory"

    User {
      string id PK
      string email UK
      string name
      string image
    }

    Airport {
      string id PK
      string icao UK
      string iata
      string name
      string municipality
      string isoCountry
      float  latitude
      float  longitude
      int    elevationFt
      string type
    }

    Airline {
      string id PK
      string icao UK
      string iata
      string name
      string callsign
      string country
      bool   active
    }

    AircraftType {
      string icaoCode UK
      string manufacturer
      string model
      int    seatsTypical
      float  fuelBurnPerHourKg
    }

    Aircraft {
      string id PK
      string icao24 UK
      string registration
      string typeCode FK
      string model
      string operator
      int    yearBuilt
    }

    Flight {
      string id PK
      string userId FK
      date   date
      string callsign
      string registration
      string icao24
      string depAirportId FK
      string arrAirportId FK
      string airlineId FK
      string aircraftTypeId FK
      string aircraftId FK
      string tripId FK
      datetime firstSeenUtc
      datetime lastSeenUtc
      float  distanceKm
      int    durationMin
      float  co2Kg
      string resolutionStatus
      string source
    }

    Track {
      string id PK
      string flightId UK_FK
      json   waypoints
      json   gaps
      json   greatCircle
      int    pointCount
      datetime fetchedAt
    }

    Trip {
      string id PK
      string userId FK
      string label
      datetime startUtc
      datetime endUtc
      string homeAirport
    }

    EmailImport {
      string id PK
      string userId FK
      string messageId UK
      string subject
      string fromAddr
      datetime receivedAt
      int    parsedFlightsCount
      string confidence
      string status
    }

    OpenSkyCredit {
      bigint id PK
      datetime day
      string endpoint
      int    credits
    }
```

## Notes

- **Indexes** matter most on `Flight(userId, date desc)` (list view), `Flight(icao24)` (same-tail detection), `Aircraft(registration)`, and `Aircraft(icao24)`.
- **Track** lives in a separate row keyed by flight so the heavy `waypoints` JSON doesn't bloat `Flight` queries.
- **Tracks.waypoints** schema:
  `[{ t: epoch_seconds, lat, lon, alt_m, vel_ms, heading, on_ground }, ...]`
- **Tracks.gaps** schema:
  `[{ start: epoch_seconds, end: epoch_seconds, duration_s }, ...]`
- **OpenSky** credit accounting is intentionally a long, flat table — daily aggregates are computed on read.
