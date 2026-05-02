/**
 * Validação simples de e-mail sem regex tripla.
 *
 * Não é "regex perfeita" (essa não existe — a RFC 5322 é gigantesca),
 * mas captura erros de digitação óbvios (sem `@`, sem TLD, espaços)
 * sem rejeitar e-mails válidos legítimos. O backend faz a validação
 * autoritativa (`[EmailAddress]` do ASP.NET ou `EmailValidator.IsValid`);
 * o client-side é só feedback imediato para o operador.
 *
 * Implementação manual (em vez de regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
 * para evitar `typescript:S5852` — Sonar marca a regex tripla `[^\s@]+`
 * como vulnerável a backtracking super-linear (DoS hotspot). A versão
 * sem regex é equivalente em intenção e linear no comprimento da
 * string.
 *
 * Originalmente vivia como função privada em
 * `src/pages/users/userFormShared.ts` (Issue #78). Promovida para
 * `src/shared/forms/` em PR #146 quando o segundo consumidor surgiu
 * (`ClientExtraEmailsTab` precisa da mesma validação client-side).
 * Lição PR #134/#135: quando dois call sites diferentes precisam da
 * mesma lógica de validação, o helper sobe para `src/shared/forms/`
 * em vez de duplicar — Sonar tokenizaria as ~10 linhas idênticas
 * como `New Code Duplication`.
 */
export function isValidEmailSyntax(value: string): boolean {
  if (!value || value.length === 0) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1) return false;
  if (at !== value.lastIndexOf('@')) return false;
  const domain = value.slice(at + 1);
  if (domain.length === 0) return false;
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}
