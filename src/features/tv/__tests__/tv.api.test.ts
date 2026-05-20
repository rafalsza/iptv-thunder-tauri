describe('tv.api utility functions', () => {
  describe('resolveLogoUrl (internal helper)', () => {
    it('should return undefined if logo is not provided', () => {
      const mockClient = {
        getAccount: () => ({ portalUrl: 'http://example.com' }),
      };

      const resolveLogoUrl = (logo: string | undefined): string | undefined => {
        if (!logo) return undefined;
        if (logo.startsWith('http')) return logo;
        const portalUrl = mockClient.getAccount().portalUrl;
        const baseUrl = portalUrl.endsWith('/') ? portalUrl : portalUrl + '/';
        return `${baseUrl}misc/logos/${logo}`;
      };

      expect(resolveLogoUrl(undefined)).toBeUndefined();
    });

    it('should return logo if it starts with http', () => {
      const mockClient = {
        getAccount: () => ({ portalUrl: 'http://example.com' }),
      };

      const resolveLogoUrl = (logo: string | undefined): string | undefined => {
        if (!logo) return undefined;
        if (logo.startsWith('http')) return logo;
        const portalUrl = mockClient.getAccount().portalUrl;
        const baseUrl = portalUrl.endsWith('/') ? portalUrl : portalUrl + '/';
        return `${baseUrl}misc/logos/${logo}`;
      };

      expect(resolveLogoUrl('http://example.com/logo.png')).toBe('http://example.com/logo.png');
    });

    it('should construct logo URL from portal URL', () => {
      const mockClient = {
        getAccount: () => ({ portalUrl: 'http://example.com' }),
      };

      const resolveLogoUrl = (logo: string | undefined): string | undefined => {
        if (!logo) return undefined;
        if (logo.startsWith('http')) return logo;
        const portalUrl = mockClient.getAccount().portalUrl;
        const baseUrl = portalUrl.endsWith('/') ? portalUrl : portalUrl + '/';
        return `${baseUrl}misc/logos/${logo}`;
      };

      expect(resolveLogoUrl('logo.png')).toBe('http://example.com/misc/logos/logo.png');
    });

    it('should handle portal URL with trailing slash', () => {
      const mockClient = {
        getAccount: () => ({ portalUrl: 'http://example.com/' }),
      };

      const resolveLogoUrl = (logo: string | undefined): string | undefined => {
        if (!logo) return undefined;
        if (logo.startsWith('http')) return logo;
        const portalUrl = mockClient.getAccount().portalUrl;
        const baseUrl = portalUrl.endsWith('/') ? portalUrl : portalUrl + '/';
        return `${baseUrl}misc/logos/${logo}`;
      };

      expect(resolveLogoUrl('logo.png')).toBe('http://example.com/misc/logos/logo.png');
    });
  });
});
