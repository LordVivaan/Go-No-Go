import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NasaEarthObservationPanel } from '../../src/components/NasaEarthObservationPanel';
import { MISSION_SCENARIOS } from '../../src/data/scenarios';
import {
  PLANETARY_COMPUTER_DATASETS,
  buildBasinBoundingBox,
  clearPlanetaryComputerCaches,
  clearRecordedEoDatasetUsage,
  fetchBasinEarthObservationScene,
  getCollectionSasToken,
  getRecordedEoDatasetUsage,
  searchPlanetaryComputerScenes,
  signPlanetaryComputerAssetUrl,
} from '../../src/services/planetaryComputerService';

const FLOODWATCH = MISSION_SCENARIOS.find((s) => s.code === 'FLOODWATCH')!;
const BRAHMAPUTRA = FLOODWATCH.targetRegions[0]!;

function mockJsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  } as Response;
}

describe('Planetary Computer Earth-Observation Service & Panel', () => {
  beforeEach(() => {
    clearPlanetaryComputerCaches();
    clearRecordedEoDatasetUsage();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('queries STAC with bounded bbox, datetime interval, limit, and cloud-cover filter for Sentinel-2 L2A', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockJsonResponse({
        features: [
          {
            id: 'S2A_MSIL2A_20240912T042701_R133_T46RBN_20240912T094948',
            bbox: [89.8, 23.2, 91.0, 24.4],
            properties: {
              datetime: '2024-09-12T04:27:01.024000Z',
              platform: 'Sentinel-2A',
              instruments: ['msi'],
              'eo:cloud_cover': 29.6,
              'proj:epsg': 32646,
            },
            assets: {
              tilejson: {
                href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?collection=sentinel-2-l2a&item=S2A_TEST',
              },
              rendered_preview: {
                href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png?collection=sentinel-2-l2a&item=S2A_TEST',
              },
              visual: {
                href: 'https://sentinel2l2a01.blob.core.windows.net/sentinel2-l2/test/visual.tif',
              },
            },
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const bbox = buildBasinBoundingBox(BRAHMAPUTRA.latitudeDeg, BRAHMAPUTRA.longitudeDeg, 0.35);
    expect(bbox).toEqual([90.05, 23.45, 90.75, 24.15]);

    const res = await searchPlanetaryComputerScenes({
      collectionId: 'sentinel-2-l2a',
      latitudeDeg: BRAHMAPUTRA.latitudeDeg,
      longitudeDeg: BRAHMAPUTRA.longitudeDeg,
      temporalMode: 'MONSOON_2024',
      maxCloudCoverPct: 85,
      limit: 20, // should be clamped to <= 6
    });

    expect(res.fromCache).toBe(false);
    expect(res.scenes).toHaveLength(1);
    expect(res.scenes[0]?.observationType).toBe('OPTICAL');
    expect(res.scenes[0]?.cloudCoverPct).toBe(29.6);
    expect(res.scenes[0]?.archiveStatus).toBe('ARCHIVED');

    const sentPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sentPayload.collections).toEqual(['sentinel-2-l2a']);
    expect(sentPayload.bbox).toEqual([90.05, 23.45, 90.75, 24.15]);
    expect(sentPayload.datetime).toBe('2024-08-08T00:00:00Z/2024-09-05T23:59:59Z');
    expect(sentPayload.limit).toBe(6);
    expect(sentPayload.query).toEqual({ 'eo:cloud_cover': { lte: 85 } });

    // Second identical search hits bounded in-memory cache without another network call
    const cached = await searchPlanetaryComputerScenes({
      collectionId: 'sentinel-2-l2a',
      latitudeDeg: BRAHMAPUTRA.latitudeDeg,
      longitudeDeg: BRAHMAPUTRA.longitudeDeg,
      temporalMode: 'MONSOON_2024',
      maxCloudCoverPct: 85,
      limit: 20,
    });
    expect(cached.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('resolves a single WebMercatorQuad tile from TileJSON and falls back gracefully offline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          features: [
            {
              id: 'S1D_IW_GRDH_1SDV_20261112T235517_rtc',
              bbox: [88.62, 23.02, 91.36, 24.95],
              properties: {
                datetime: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
                platform: 'sentinel-1d',
                'sat:orbit_state': 'descending',
                'sar:instrument_mode': 'IW',
                'sar:polarizations': ['VV', 'VH'],
                'proj:epsg': 32646,
              },
              assets: {
                tilejson: {
                  href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json?collection=sentinel-1-rtc&item=S1D_TEST',
                },
                rendered_preview: {
                  href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png?collection=sentinel-1-rtc&item=S1D_TEST',
                },
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          tiles: [
            'https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-1-rtc&item=S1D_TEST',
          ],
          bounds: [88.62, 23.02, 91.36, 24.95],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const liveRes = await fetchBasinEarthObservationScene({
      collectionId: 'sentinel-1-rtc',
      region: BRAHMAPUTRA,
      temporalMode: 'RECENT_ARCHIVE',
      zoom: 9,
    });

    expect(liveRes.status).toBe('LIVE');
    expect(liveRes.isFallback).toBe(false);
    expect(liveRes.selectedScene?.archiveStatus).toBe('RECENT');
    expect(liveRes.selectedScene?.observationType).toBe('SAR');
    expect(liveRes.tileRef).toEqual({
      z: 9,
      x: 384,
      y: 221,
      renderMode: 'WEBMERCATOR_TILE',
    });
    expect(liveRes.imageryUrl).toContain('/WebMercatorQuad/9/384/221@1x.png');
    expect(getRecordedEoDatasetUsage()).toHaveLength(1);
    expect(getRecordedEoDatasetUsage()[0]?.datasetId).toBe('sentinel-1-rtc');

    // Offline failure returns explicitly labelled fallback without throwing
    clearPlanetaryComputerCaches();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));

    const offlineRes = await fetchBasinEarthObservationScene({
      collectionId: 'sentinel-1-rtc',
      region: BRAHMAPUTRA,
      temporalMode: 'MONSOON_2024',
    });
    expect(offlineRes.status).toBe('OFFLINE_FALLBACK');
    expect(offlineRes.isFallback).toBe(true);
    expect(offlineRes.imageryUrl).toBeNull();
    expect(offlineRes.detail).toContain('offline baseline context active');
  });

  it('caches SAS tokens, tracks expiry, refreshes expired tokens, and never persists secrets', async () => {
    const t0 = Date.parse('2026-11-15T05:00:00Z');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          token: 'se=2026-11-15T05:45:00Z&sig=FIRST_TOKEN',
          'msft:expiry': '2026-11-15T05:45:00Z',
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          token: 'se=2026-11-15T06:45:00Z&sig=REFRESHED_TOKEN',
          'msft:expiry': '2026-11-15T06:45:00Z',
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    // First fetch obtains token
    const first = await getCollectionSasToken('sentinel-1-rtc', { nowMs: t0 });
    expect(first.token).toContain('FIRST_TOKEN');

    // Within validity window -> reuses cached token
    const reused = await getCollectionSasToken('sentinel-1-rtc', {
      nowMs: t0 + 10 * 60 * 1000,
    });
    expect(reused.token).toContain('FIRST_TOKEN');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Within 60s expiry buffer -> automatically refreshes token
    const signed = await signPlanetaryComputerAssetUrl(
      'https://example.blob.core.windows.net/s1-rtc/item/vv.tif',
      'sentinel-1-rtc',
      { nowMs: Date.parse('2026-11-15T05:44:30Z') }
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signed.signedUrl).toContain('REFRESHED_TOKEN');
    expect(signed.expiryIso).toBe('2026-11-15T06:45:00Z');

    // Never writes SAS tokens to localStorage
    expect(localStorage.length).toBe(0);
    expect(PLANETARY_COMPUTER_DATASETS['sentinel-1-rtc'].cloudPenetrating).toBe(true);
    expect(PLANETARY_COMPUTER_DATASETS['sentinel-2-l2a'].cloudPenetrating).toBe(false);
  });

  it('retries once on HTTP 429 and surfaces payload cloud-cover warning in UI', async () => {
    let s1Attempts = 0;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as { collections?: string[] }) : {};
      const collection = body.collections?.[0];
      if (collection === 'sentinel-1-rtc') {
        s1Attempts += 1;
        if (s1Attempts === 1) {
          return mockJsonResponse({}, 429, { 'Retry-After': '0' });
        }
        return mockJsonResponse({
          features: [
            {
              id: 'S1_RETRY_OK',
              bbox: [89.5, 23.0, 91.5, 24.5],
              properties: {
                datetime: '2024-09-04T23:56:43Z',
                platform: 'sentinel-1a',
                'sar:instrument_mode': 'IW',
                'sar:polarizations': ['VV', 'VH'],
              },
              assets: {
                rendered_preview: {
                  href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png?collection=sentinel-1-rtc&item=S1_RETRY_OK',
                },
              },
            },
          ],
        });
      }
      return mockJsonResponse({
        features: [
          {
            id: 'S2_CLOUDY_OK',
            bbox: [89.5, 23.0, 91.5, 24.5],
            properties: {
              datetime: '2024-09-02T04:27:01Z',
              platform: 'Sentinel-2A',
              instruments: ['msi'],
              'eo:cloud_cover': 83.9,
            },
            assets: {
              rendered_preview: {
                href: 'https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png?collection=sentinel-2-l2a&item=S2_CLOUDY_OK',
              },
            },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <NasaEarthObservationPanel
        targetRegions={FLOODWATCH.targetRegions}
        hasCloudPenetratingPayload={false}
      />
    );

    expect(screen.getByText(/Spacecraft Payload Notice:/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('S1_RETRY_OK')).toBeTruthy();
      expect(screen.getByText('S2_CLOUDY_OK')).toBeTruthy();
    });

    expect(screen.getByText(/83.9% \(eo:cloud_cover\)/i)).toBeTruthy();
    expect(screen.getAllByText(/ACTUAL SATELLITE DATA/i).length).toBeGreaterThanOrEqual(2);

    // Switching to NASA GIBS mode renders GIBS controls cleanly
    fireEvent.click(screen.getByRole('button', { name: /NASA GIBS WMTS/i }));
    expect(screen.getByLabelText(/NASA GIBS Layer/i)).toBeTruthy();
  });
});
