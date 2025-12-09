'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname?.startsWith(path);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold text-gray-900">
                Coviu Triage
              </Link>
              <nav className="flex gap-4">
                <Link
                  href="/dashboard"
                  className={pathname === '/dashboard' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Dashboard
                </Link>
                <Link
                  href="/form-templates"
                  className={isActive('/form-templates') || isActive('/form-builder') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Form Templates
                </Link>
                <Link
                  href="/telehealth-invites"
                  className={isActive('/telehealth-invites') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Telehealth Invites
                </Link>
                <Link
                  href="/run-sheet"
                  className={isActive('/run-sheet') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Run Sheet
                </Link>
              </nav>
            </div>
            <div className="text-sm text-gray-500">
              Prototype - No Authentication
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
