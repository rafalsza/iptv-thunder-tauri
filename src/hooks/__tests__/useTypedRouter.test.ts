import {
  isMovieDetails,
  isSeriesDetails,
  getRouteType,
  isRouteType,
  type Route,
} from '../useTypedRouter';

describe('useTypedRouter utilities', () => {
  describe('isMovieDetails', () => {
    it('should return true for movie-details route', () => {
      const route: Route = { type: 'movie-details', movie: { id: 1, name: 'Movie' } as any };
      expect(isMovieDetails(route)).toBe(true);
    });

    it('should return false for other routes', () => {
      const route: Route = { type: 'movies' };
      expect(isMovieDetails(route)).toBe(false);
    });

    it('should return false for series-details route', () => {
      const route: Route = { type: 'series-details', series: { id: 1, name: 'Series' } as any };
      expect(isMovieDetails(route)).toBe(false);
    });
  });

  describe('isSeriesDetails', () => {
    it('should return true for series-details route', () => {
      const route: Route = { type: 'series-details', series: { id: 1, name: 'Series' } as any };
      expect(isSeriesDetails(route)).toBe(true);
    });

    it('should return false for other routes', () => {
      const route: Route = { type: 'series' };
      expect(isSeriesDetails(route)).toBe(false);
    });

    it('should return false for movie-details route', () => {
      const route: Route = { type: 'movie-details', movie: { id: 1, name: 'Movie' } as any };
      expect(isSeriesDetails(route)).toBe(false);
    });
  });

  describe('getRouteType', () => {
    it('should return the route type string', () => {
      const route: Route = { type: 'movies' };
      expect(getRouteType(route)).toBe('movies');
    });

    it('should return movie-details for movie details route', () => {
      const route: Route = { type: 'movie-details', movie: { id: 1, name: 'Movie' } as any };
      expect(getRouteType(route)).toBe('movie-details');
    });

    it('should return series-details for series details route', () => {
      const route: Route = { type: 'series-details', series: { id: 1, name: 'Series' } as any };
      expect(getRouteType(route)).toBe('series-details');
    });
  });

  describe('isRouteType', () => {
    it('should return true when route type matches', () => {
      const route: Route = { type: 'movies' };
      expect(isRouteType(route, 'movies')).toBe(true);
    });

    it('should return false when route type does not match', () => {
      const route: Route = { type: 'movies' };
      expect(isRouteType(route, 'series')).toBe(false);
    });

    it('should work with param routes', () => {
      const route: Route = { type: 'movie-details', movie: { id: 1, name: 'Movie' } as any };
      expect(isRouteType(route, 'movie-details')).toBe(true);
    });
  });
});
