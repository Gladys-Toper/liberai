import { Users, BookOpen, Mail, DollarSign, Calendar, Wallet } from 'lucide-react'
import { getUserList, getAuthorList } from '@/lib/db/queries/admin'
import { formatNumber } from '@/lib/utils'

export default async function CRMPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const userSearch = typeof params.userSearch === 'string' ? params.userSearch : ''
  const authorSearch = typeof params.authorSearch === 'string' ? params.authorSearch : ''
  const userRole = typeof params.role === 'string' ? params.role : undefined
  const userPage = typeof params.userPage === 'string' ? Number(params.userPage) : 1
  const authorPage = typeof params.authorPage === 'string' ? Number(params.authorPage) : 1

  const [{ users, total: totalUsers }, { authors, total: totalAuthors }] =
    await Promise.all([
      getUserList({ search: userSearch || undefined, role: userRole, page: userPage, perPage: 15 }),
      getAuthorList({ search: authorSearch || undefined, page: authorPage, perPage: 15 }),
    ])

  return (
    <div className="px-6 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">CRM</h1>
        <p className="text-xs text-zinc-600">
          Users &amp; authors management
        </p>
      </div>

      {/* Users Table */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Users
          </h2>
          <span className="text-[11px] text-zinc-700">{totalUsers} total</span>
        </div>

        {/* Search */}
        <form className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              name="userSearch"
              defaultValue={userSearch}
              placeholder="Search by email..."
              className="w-full rounded-lg border border-[#27272a] bg-[#0e0e0e] py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50"
            />
          </div>
          <select
            name="role"
            defaultValue={userRole || ''}
            className="rounded-lg border border-[#27272a] bg-[#0e0e0e] px-3 py-2 text-xs text-zinc-300 outline-none focus:border-violet-500/50"
          >
            <option value="">All roles</option>
            <option value="reader">Reader</option>
            <option value="author">Author</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-medium text-white hover:bg-violet-600 transition-colors"
          >
            Filter
          </button>
        </form>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-[#1e1e1e]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1e1e1e] bg-[#0c0c0c]">
                <th className="px-4 py-2.5 font-medium text-zinc-500">Email</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Role</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Orders</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-[#1e1e1e] last:border-0 bg-[#111] transition-colors hover:bg-[#141414]"
                  >
                    <td className="px-4 py-2.5 text-zinc-300">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-400">
                      {u.orderCount}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {new Date(u.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-600">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalUsers > 15 && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-600">
            <span>
              Page {userPage} of {Math.ceil(totalUsers / 15)}
            </span>
            <div className="flex gap-2">
              {userPage > 1 && (
                <a
                  href={`/admin/crm?userPage=${userPage - 1}${userSearch ? `&userSearch=${userSearch}` : ''}${userRole ? `&role=${userRole}` : ''}`}
                  className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  Previous
                </a>
              )}
              {userPage < Math.ceil(totalUsers / 15) && (
                <a
                  href={`/admin/crm?userPage=${userPage + 1}${userSearch ? `&userSearch=${userSearch}` : ''}${userRole ? `&role=${userRole}` : ''}`}
                  className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  Next
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Authors Table */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Authors
          </h2>
          <span className="text-[11px] text-zinc-700">{totalAuthors} total</span>
        </div>

        {/* Search */}
        <form className="mb-3">
          <div className="relative">
            <Users className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              name="authorSearch"
              defaultValue={authorSearch}
              placeholder="Search authors by name..."
              className="w-full rounded-lg border border-[#27272a] bg-[#0e0e0e] py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500/50"
            />
          </div>
        </form>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-[#1e1e1e]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1e1e1e] bg-[#0c0c0c]">
                <th className="px-4 py-2.5 font-medium text-zinc-500">Name</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Email</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Books</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Revenue</th>
                <th className="px-4 py-2.5 font-medium text-zinc-500">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {authors.length > 0 ? (
                authors.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[#1e1e1e] last:border-0 bg-[#111] transition-colors hover:bg-[#141414]"
                  >
                    <td className="px-4 py-2.5 font-medium text-zinc-200">
                      {a.displayName}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{a.email}</td>
                    <td className="px-4 py-2.5 tabular-nums text-zinc-400">
                      {a.bookCount}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-emerald-400">
                      ${a.totalRevenue.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-600">
                      {a.walletAddress
                        ? `${a.walletAddress.slice(0, 6)}...${a.walletAddress.slice(-4)}`
                        : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-600">
                    No authors found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalAuthors > 15 && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-600">
            <span>
              Page {authorPage} of {Math.ceil(totalAuthors / 15)}
            </span>
            <div className="flex gap-2">
              {authorPage > 1 && (
                <a
                  href={`/admin/crm?authorPage=${authorPage - 1}${authorSearch ? `&authorSearch=${authorSearch}` : ''}`}
                  className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  Previous
                </a>
              )}
              {authorPage < Math.ceil(totalAuthors / 15) && (
                <a
                  href={`/admin/crm?authorPage=${authorPage + 1}${authorSearch ? `&authorSearch=${authorSearch}` : ''}`}
                  className="rounded border border-[#27272a] px-2.5 py-1 text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors"
                >
                  Next
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: 'bg-violet-500/10 text-violet-400',
    author: 'bg-emerald-500/10 text-emerald-400',
    reader: 'bg-sky-500/10 text-sky-400',
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[role] || 'bg-zinc-500/10 text-zinc-400'}`}
    >
      {role}
    </span>
  )
}
