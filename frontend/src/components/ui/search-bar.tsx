// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated a reusable controlled search input component with an icon and onValueChange callback.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { SearchIcon } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

interface SearchBarProps {
    id: string;
    label: string;
    placeholder?: string;
    value: string;
    onValueChange: (value: string) => void;
    onSearch: () => void;
}

const SearchBar = ({
    id,
    label,
    placeholder,
    value,
    onValueChange,
    onSearch,
}: SearchBarProps) => (
    <form
        className="flex flex-1 flex-col gap-2"
        onSubmit={event => {
            event.preventDefault();
            onSearch();
        }}
    >
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-2">
            <Input
                id={id}
                type="search"
                placeholder={placeholder}
                value={value}
                onChange={event => onValueChange(event.target.value)}
            />
            <Button type="submit" variant="indigo">
                <SearchIcon />
                Search
            </Button>
        </div>
    </form>
);

export default SearchBar;
