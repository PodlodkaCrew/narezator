import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
 title: 'Cutroom — Skills interview editor',
 description: 'Edit the conversation with synchronized video, words, and chapters.',
 robots: { index: false, follow: false },
};
export default function RootLayout({children}: {children: React.ReactNode}) {
 return <html lang="en"><body>{children}</body></html>;
}
