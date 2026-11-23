import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { WaitButton } from './wait-button';

describe('WaitButton', () => {
  it('waits while its own press is answered, and not while another button of the form is', async () => {
    let done = () => {};
    const slow = () => new Promise<void>(resolve => { done = resolve; });
    render(<form><WaitButton formAction={slow} word="Saving">Save</WaitButton><button formAction={slow}>Off</button></form>);
    const save = screen.getByRole('button', { name: 'Save' });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Off' })); });
    expect(save).not.toHaveAttribute('aria-busy');
    await act(async () => { done(); });

    await act(async () => { fireEvent.click(save); });
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(save).toBeDisabled();
    await act(async () => { done(); });
    expect(save).not.toHaveAttribute('aria-busy');
    expect(save).toBeEnabled();
  });
});
