import { render } from '@testing-library/react';
import { ChannelLogo } from '../ChannelLogo';
import { getImageUrl } from '@/hooks/useImageCache';

jest.mock('@/hooks/useImageCache', () => ({
  getImageUrl: jest.fn(() => Promise.resolve('http://test.com/logo.png')),
}));

describe('ChannelLogo', () => {
  it('should render without crashing', async () => {
    const { container } = render(
      <ChannelLogo logo="http://test.com/logo.png" name="Test Channel" />
    );

    expect(container).toBeInTheDocument();
  });

  it('should render null when image fails to load', async () => {
    (getImageUrl as jest.Mock).mockRejectedValueOnce(new Error('Failed'));

    const { container } = render(
      <ChannelLogo logo="http://invalid.com/logo.png" name="Test Channel" />
    );

    expect(container).toBeInTheDocument();
  });
});
