import { Nav } from './nav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="p-6">{children}</main>
    </div>
  )
}
