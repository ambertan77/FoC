import { useState } from 'react';
import { MailPlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SearchBar from '@/components/ui/search-bar';
import { Spinner } from '@/components/ui/spinner';
import { ROLES, type ApiUser, type Role } from '@/features/auth/types/auth.types';
import PromoteUserDialog from '@/features/user/components/PromoteUserDialog';
import CreateAdminInvitationDialog from '@/features/user/components/CreateAdminInvitationDialog';
import useAdminUsers from '@/features/user/hooks/useAdminUsers';
import useCreateAdminInvitation from '@/features/user/hooks/useCreateAdminInvitation';
import usePromoteUser from '@/features/user/hooks/usePromoteUser';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAGE_SIZE = 20;

const ManageUsersPage = () => {
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [role, setRole] = useState<Role | ''>('');
    const [page, setPage] = useState(1);
    const [userToPromote, setUserToPromote] = useState<ApiUser | null>(null);
    const [isPromoteAdminOpen, setIsPromoteAdminOpen] = useState(false);
    const [isCreateAdminOpen, setIsCreateAdminOpen] = useState(false);

    const { promoteUser, isPending: isPromoting } = usePromoteUser();
    const {
        createAdminInvitation,
        isPending: isCreatingAdmin,
    } = useCreateAdminInvitation();

    const usersQuery = useAdminUsers({
        search: search || undefined,
        role: role || undefined,
        page,
        pageSize: PAGE_SIZE,
    });

    const users = usersQuery.data?.users ?? [];
    const total = usersQuery.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleSearch = () => {
        setSearch(searchInput.trim());
        setPage(1);
    };

    const handleSearchInputChange = (value: string) => {
        setSearchInput(value);

        if (!value) {
            setSearch('');
            setPage(1);
        }
    };

    const ROLE_LABELS: Record<Role | "ALL", string> = {
        ALL: "All roles",
        [ROLES.STUDENT]: "Student",
        [ROLES.ADMIN]: "Admin",
    };

    return (
        <main className="px-5 py-5 md:px-10">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl md:text-2xl font-bold">Manage Users</h1>
                    <p className="text-sm text-muted-foreground">
                        Search and review registered user accounts.
                    </p>
                </div>
                <Dialog open={isCreateAdminOpen} onOpenChange={setIsCreateAdminOpen}>
                    <DialogTrigger
                        render={
                            <Button
                                type="button"
                                variant="indigo"
                            >
                                <MailPlusIcon />
                                Create admin
                            </Button>
                        }
                    />
                    {isCreateAdminOpen && (
                        <CreateAdminInvitationDialog
                            isPending={isCreatingAdmin}
                            onClose={() => setIsCreateAdminOpen(false)}
                            onSubmit={payload => {
                                createAdminInvitation(payload, {
                                    onSuccess: () => setIsCreateAdminOpen(false),
                                });
                            }}
                        />
                    )}
                </Dialog>
            </div>

            <section className="rounded-xl bg-card p-4 shadow-md ring-1 ring-foreground/10 md:p-6">
                <div
                    className="mb-5 flex flex-col gap-4 md:flex-row md:items-end"
                >
                    <SearchBar
                        id="user-search"
                        label="Search users"
                        placeholder="Search by username or email"
                        value={searchInput}
                        onValueChange={handleSearchInputChange}
                        onSearch={handleSearch}
                    />

                    <div className="flex flex-col gap-2 md:w-48">
                        <Label htmlFor="role-filter">Role</Label>
                        <Select
                            value={role === "" ? "ALL" : role}
                            onValueChange={(value) => {
                                setRole(value === "ALL" ? "" : (value as Role));
                                setPage(1);
                            }}
                        >
                            <SelectTrigger id="role-filter" className="w-full bg-white">
                                <SelectValue placeholder="All roles">
                                    {ROLE_LABELS[role === "" ? "ALL" : role]}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                                <SelectItem value="ALL">All roles</SelectItem>
                                <SelectItem value={ROLES.STUDENT}>Student</SelectItem>
                                <SelectItem value={ROLES.ADMIN}>Admin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {usersQuery.isLoading && (
                    <div className="flex w-full flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
                        <Spinner className="size-6" />
                        <span>Loading users...</span>
                    </div>
                )}

                {usersQuery.isError && (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <p className="text-sm text-destructive">
                            {usersQuery.error.message}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void usersQuery.refetch()}
                        >
                            Try again
                        </Button>
                    </div>
                )}

                {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 && (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                        {search || role
                            ? 'No users match the current search and filter.'
                            : 'No user accounts found.'}
                    </p>
                )}

                {!usersQuery.isLoading && !usersQuery.isError && users.length > 0 && (
                    <>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full min-w-3xl text-left text-sm">
                                <thead className="bg-muted/60 text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Username</th>
                                        <th className="px-4 py-3 font-medium">Email</th>
                                        <th className="px-4 py-3 font-medium">Phone number</th>
                                        <th className="px-4 py-3 font-medium">Role</th>
                                        <th className="px-4 py-3 text-right font-medium">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {users.map(user => (
                                        <tr key={user.id} className="bg-card">
                                            <td className="px-4 py-3 font-medium">{user.username}</td>
                                            <td className="px-4 py-3">{user.email}</td>
                                            <td className="px-4 py-3">{user.phoneNumber}</td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className={
                                                        user.role === ROLES.ADMIN
                                                            ? 'rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800'
                                                            : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700'
                                                    }
                                                >
                                                    {user.role === ROLES.ADMIN ? 'Admin' : 'Student'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {user.role === ROLES.STUDENT ? (
                                                    <Dialog open={isPromoteAdminOpen} onOpenChange={setIsPromoteAdminOpen}>
                                                        <DialogTrigger
                                                            render={
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => setUserToPromote(user)}
                                                                >
                                                                    Make admin
                                                                </Button>
                                                            }
                                                        />
                                                        {userToPromote && (
                                                            <PromoteUserDialog
                                                                user={userToPromote}
                                                                isPending={isPromoting}
                                                                onClose={() => setUserToPromote(null)}
                                                                onConfirm={() => {
                                                                    promoteUser(userToPromote.id, {
                                                                        onSuccess: () => {
                                                                            setUserToPromote(null);
                                                                            setPage(1);
                                                                        },
                                                                    });
                                                                }}
                                                            />
                                                        )}
                                                    </Dialog>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        Already admin
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <p>
                                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={page === 1}
                                    onClick={() => setPage(current => current - 1)}
                                >
                                    Previous
                                </Button>
                                <span className="px-2 text-foreground">
                                    Page {page} of {totalPages}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(current => current + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </section>
        </main>
    );
};

export default ManageUsersPage;
