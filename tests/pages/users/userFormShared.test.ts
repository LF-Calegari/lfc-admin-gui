import { describe, expect, it } from 'vitest';

import type { ApiError } from '@/shared/api';

import {
  buildCreateUserPayload,
  buildUpdateUserPayload,
  classifyUserSubmitError,
  decideUserBadRequestHandling,
  EMAIL_MAX,
  extractUserValidationErrors,
  INITIAL_USER_FORM_STATE,
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  validateUserForm,
  validateUserUpdateForm,
  type UserFormState,
  type UserSubmitErrorCopy,
} from '@/pages/users/userFormShared';

/**
 * Suíte do `userFormShared` (Issue #78). Cobre as 4 funções puras:
 *
 * - `validateUserForm` — regras client-side espelhando o backend.
 * - `extractUserValidationErrors` — parse de `ValidationProblemDetails`.
 * - `decideUserBadRequestHandling` — decisão entre field-errors e
 *   submit-error.
 * - `classifyUserSubmitError` — discriminação por status HTTP.
 *
 * Estratégia: fixar um `UserFormState` válido como baseline e
 * sobrescrever só o que cada cenário precisa testar — colapsa
 * boilerplate e mantém os testes focados na regra que cobrem.
 */

const VALID_STATE: UserFormState = {
  name: 'Alice Admin',
  email: 'alice@example.com',
  password: 'senha-forte-1',
  identity: '1',
  clientId: '',
  active: true,
};

const COPY: UserSubmitErrorCopy = {
  conflictDefault: 'Já existe um usuário com este e-mail.',
  forbiddenTitle: 'Falha ao criar usuário',
  genericFallback: 'Não foi possível criar o usuário. Tente novamente.',
};

describe('INITIAL_USER_FORM_STATE', () => {
  it('parte de campos vazios e active=true (default do backend)', () => {
    expect(INITIAL_USER_FORM_STATE).toEqual({
      name: '',
      email: '',
      password: '',
      identity: '',
      clientId: '',
      active: true,
    });
  });
});

describe('validateUserForm — caso válido', () => {
  it('devolve null quando todos os campos estão válidos', () => {
    expect(validateUserForm(VALID_STATE)).toBeNull();
  });

  it('aceita clientId UUID válido', () => {
    expect(
      validateUserForm({
        ...VALID_STATE,
        clientId: '11111111-1111-1111-1111-111111111111',
      }),
    ).toBeNull();
  });

  it('aceita active=false (cadastra usuário inativo)', () => {
    expect(validateUserForm({ ...VALID_STATE, active: false })).toBeNull();
  });

  it('aceita identity 0 e identity negativo (discriminator legacy)', () => {
    expect(validateUserForm({ ...VALID_STATE, identity: '0' })).toBeNull();
    expect(validateUserForm({ ...VALID_STATE, identity: '-1' })).toBeNull();
  });
});

describe('validateUserForm — name', () => {
  it('exige nome', () => {
    expect(validateUserForm({ ...VALID_STATE, name: '' })?.name).toBe('Nome é obrigatório.');
    expect(validateUserForm({ ...VALID_STATE, name: '   ' })?.name).toBe('Nome é obrigatório.');
  });

  it('rejeita nome maior que NAME_MAX', () => {
    const tooLong = 'a'.repeat(NAME_MAX + 1);
    expect(validateUserForm({ ...VALID_STATE, name: tooLong })?.name).toBe(
      `Nome deve ter no máximo ${NAME_MAX} caracteres.`,
    );
  });
});

describe('validateUserForm — email', () => {
  it('exige email', () => {
    expect(validateUserForm({ ...VALID_STATE, email: '' })?.email).toBe('E-mail é obrigatório.');
  });

  it('rejeita formato inválido', () => {
    expect(validateUserForm({ ...VALID_STATE, email: 'no-at' })?.email).toBe(
      'Informe um e-mail válido.',
    );
    expect(validateUserForm({ ...VALID_STATE, email: 'a@b' })?.email).toBe(
      'Informe um e-mail válido.',
    );
    expect(validateUserForm({ ...VALID_STATE, email: 'a b@c.com' })?.email).toBe(
      'Informe um e-mail válido.',
    );
  });

  it('rejeita email maior que EMAIL_MAX', () => {
    const longLocalPart = 'a'.repeat(EMAIL_MAX);
    const longEmail = `${longLocalPart}@x.io`;
    expect(validateUserForm({ ...VALID_STATE, email: longEmail })?.email).toBe(
      `E-mail deve ter no máximo ${EMAIL_MAX} caracteres.`,
    );
  });

  it('aceita formato válido com TLD', () => {
    expect(validateUserForm({ ...VALID_STATE, email: 'user.name+tag@empresa.com.br' })).toBeNull();
  });
});

describe('validateUserForm — password', () => {
  it('exige senha', () => {
    expect(validateUserForm({ ...VALID_STATE, password: '' })?.password).toBe(
      'Senha é obrigatória.',
    );
  });

  it('rejeita senha menor que PASSWORD_MIN', () => {
    const tooShort = 'a'.repeat(PASSWORD_MIN - 1);
    expect(validateUserForm({ ...VALID_STATE, password: tooShort })?.password).toBe(
      `Senha deve ter ao menos ${PASSWORD_MIN} caracteres.`,
    );
  });

  it('rejeita senha maior que PASSWORD_MAX', () => {
    const tooLong = 'a'.repeat(PASSWORD_MAX + 1);
    expect(validateUserForm({ ...VALID_STATE, password: tooLong })?.password).toBe(
      `Senha deve ter no máximo ${PASSWORD_MAX} caracteres.`,
    );
  });

  it('aceita senha exatamente em PASSWORD_MIN e PASSWORD_MAX', () => {
    expect(
      validateUserForm({ ...VALID_STATE, password: 'a'.repeat(PASSWORD_MIN) }),
    ).toBeNull();
    expect(
      validateUserForm({ ...VALID_STATE, password: 'a'.repeat(PASSWORD_MAX) }),
    ).toBeNull();
  });

  it('preserva espaços laterais (não trima senha)', () => {
    // Senhas com espaços laterais (raro mas possível em gerenciadores)
    // são aceitas como válidas — o trim cabe ao backend se quiser.
    const padded = `  ${'a'.repeat(PASSWORD_MIN)}  `;
    expect(validateUserForm({ ...VALID_STATE, password: padded })).toBeNull();
  });
});

describe('validateUserForm — identity', () => {
  it('exige identity', () => {
    expect(validateUserForm({ ...VALID_STATE, identity: '' })?.identity).toBe(
      'Identity é obrigatório.',
    );
    expect(validateUserForm({ ...VALID_STATE, identity: '   ' })?.identity).toBe(
      'Identity é obrigatório.',
    );
  });

  it('rejeita não-inteiros', () => {
    expect(validateUserForm({ ...VALID_STATE, identity: 'abc' })?.identity).toBe(
      'Identity deve ser um número inteiro.',
    );
    expect(validateUserForm({ ...VALID_STATE, identity: '1.5' })?.identity).toBe(
      'Identity deve ser um número inteiro.',
    );
    expect(validateUserForm({ ...VALID_STATE, identity: '1e2' })?.identity).toBe(
      'Identity deve ser um número inteiro.',
    );
    expect(validateUserForm({ ...VALID_STATE, identity: '+1' })?.identity).toBe(
      'Identity deve ser um número inteiro.',
    );
  });
});

describe('validateUserForm — clientId', () => {
  it('aceita clientId vazio (backend gera via LegacyClientFactory)', () => {
    expect(validateUserForm({ ...VALID_STATE, clientId: '' })).toBeNull();
    expect(validateUserForm({ ...VALID_STATE, clientId: '   ' })).toBeNull();
  });

  it('rejeita clientId em formato não-UUID', () => {
    expect(validateUserForm({ ...VALID_STATE, clientId: 'abc' })?.clientId).toBe(
      'ClientId deve ser um UUID válido.',
    );
    expect(validateUserForm({ ...VALID_STATE, clientId: '11111111-1111' })?.clientId).toBe(
      'ClientId deve ser um UUID válido.',
    );
  });

  it('aceita clientId UUID maiúsculo, minúsculo e misto', () => {
    expect(
      validateUserForm({
        ...VALID_STATE,
        clientId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      }),
    ).toBeNull();
    expect(
      validateUserForm({
        ...VALID_STATE,
        clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      }),
    ).toBeNull();
    expect(
      validateUserForm({
        ...VALID_STATE,
        clientId: 'AaAaAaAa-bBbB-cCcC-dDdD-EeEeEeEeEeEe',
      }),
    ).toBeNull();
  });
});

describe('extractUserValidationErrors', () => {
  it('mapeia campos PascalCase do backend para camelCase do form', () => {
    const result = extractUserValidationErrors({
      errors: {
        Name: ['Name é obrigatório.'],
        Email: ['Email inválido.'],
        Password: ['Password deve ter no máximo 60 caracteres.'],
        Identity: ['The Identity field is required.'],
        ClientId: ['ClientId inválido.'],
      },
    });
    expect(result).toEqual({
      name: 'Name é obrigatório.',
      email: 'Email inválido.',
      password: 'Password deve ter no máximo 60 caracteres.',
      identity: 'The Identity field is required.',
      clientId: 'ClientId inválido.',
    });
  });

  it('aceita string em vez de array', () => {
    expect(
      extractUserValidationErrors({ errors: { Name: 'Erro literal.' } }),
    ).toEqual({ name: 'Erro literal.' });
  });

  it('ignora campos não-mapeáveis sem quebrar', () => {
    expect(
      extractUserValidationErrors({
        errors: { CustomField: ['x'], Name: ['y'] },
      }),
    ).toEqual({ name: 'y' });
  });

  it('devolve null quando o payload não é um ValidationProblemDetails', () => {
    expect(extractUserValidationErrors(null)).toBeNull();
    expect(extractUserValidationErrors(undefined)).toBeNull();
    expect(extractUserValidationErrors('texto')).toBeNull();
    expect(extractUserValidationErrors({})).toBeNull();
    expect(extractUserValidationErrors({ errors: null })).toBeNull();
    expect(extractUserValidationErrors({ errors: 'string' })).toBeNull();
  });

  it('devolve null quando errors está vazio ou só tem campos não-mapeáveis', () => {
    expect(extractUserValidationErrors({ errors: {} })).toBeNull();
    expect(extractUserValidationErrors({ errors: { Outro: ['x'] } })).toBeNull();
  });
});

describe('decideUserBadRequestHandling', () => {
  it('devolve field-errors quando o payload tem errors mapeáveis', () => {
    const decision = decideUserBadRequestHandling(
      { errors: { Email: ['Email inválido.'] } },
      'fallback',
    );
    expect(decision).toEqual({
      kind: 'field-errors',
      errors: { email: 'Email inválido.' },
    });
  });

  it('devolve submit-error com fallback quando errors é não-mapeável (caso ClientId)', () => {
    const decision = decideUserBadRequestHandling(
      { message: 'ClientId informado não existe.' },
      'fallback',
    );
    expect(decision).toEqual({ kind: 'submit-error', message: 'fallback' });
  });
});

describe('classifyUserSubmitError', () => {
  function httpError(status: number, message = 'erro', details?: unknown): ApiError {
    return { kind: 'http', status, message, details };
  }

  it('mapeia 409 para conflict no campo email', () => {
    const action = classifyUserSubmitError(httpError(409, 'Já existe.'), COPY);
    expect(action).toEqual({ kind: 'conflict', field: 'email', message: 'Já existe.' });
  });

  it('mapeia 400 para bad-request com details cru', () => {
    const details = { errors: { Email: ['x'] } };
    const action = classifyUserSubmitError(httpError(400, 'validação', details), COPY);
    expect(action).toEqual({
      kind: 'bad-request',
      details,
      fallbackMessage: 'validação',
    });
  });

  it('mapeia 401/403 para toast com mensagem do backend', () => {
    expect(
      classifyUserSubmitError(httpError(401, 'Sessão expirada.'), COPY),
    ).toEqual({
      kind: 'toast',
      message: 'Sessão expirada.',
      title: COPY.forbiddenTitle,
    });
    expect(
      classifyUserSubmitError(httpError(403, 'Sem permissão.'), COPY),
    ).toEqual({
      kind: 'toast',
      message: 'Sem permissão.',
      title: COPY.forbiddenTitle,
    });
  });

  it('mapeia 404 para not-found', () => {
    expect(classifyUserSubmitError(httpError(404), COPY)).toEqual({
      kind: 'not-found',
    });
  });

  it('mapeia status 5xx e network/parse para unhandled', () => {
    expect(classifyUserSubmitError(httpError(500), COPY)).toEqual({
      kind: 'unhandled',
      title: COPY.forbiddenTitle,
      fallback: COPY.genericFallback,
    });
    expect(classifyUserSubmitError(new Error('network'), COPY)).toEqual({
      kind: 'unhandled',
      title: COPY.forbiddenTitle,
      fallback: COPY.genericFallback,
    });
  });
});

describe('validateUserUpdateForm', () => {
  it('retorna null para estado válido (sem exigir senha)', () => {
    // Edição não exige senha — `password: ''` é aceito.
    expect(
      validateUserUpdateForm({ ...VALID_STATE, password: '' }),
    ).toBeNull();
  });

  it('aplica as mesmas regras de name/email/identity/clientId que validateUserForm', () => {
    const errors = validateUserUpdateForm({
      ...VALID_STATE,
      name: '',
      email: 'no-at',
      identity: '1.5',
      clientId: 'abc',
      password: '', // ignorado em update
    });

    expect(errors).toEqual({
      name: 'Nome é obrigatório.',
      email: 'Informe um e-mail válido.',
      identity: 'Identity deve ser um número inteiro.',
      clientId: 'ClientId deve ser um UUID válido.',
    });
  });

  it('não popula erro de password mesmo com password vazia', () => {
    const errors = validateUserUpdateForm({ ...VALID_STATE, password: '' });
    expect(errors).toBeNull();
  });
});

describe('buildCreateUserPayload', () => {
  it('produz CreateUserPayload com campos trimados, identity como int e active explícito', () => {
    expect(
      buildCreateUserPayload({
        ...VALID_STATE,
        name: '  Alice  ',
        email: '  alice@example.com  ',
        identity: '  42  ',
        clientId: '',
      }),
    ).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
      password: VALID_STATE.password,
      identity: 42,
      active: true,
    });
  });

  it('inclui clientId quando informado e omite quando vazio', () => {
    const validClientId = '11111111-1111-1111-1111-111111111111';
    expect(
      buildCreateUserPayload({ ...VALID_STATE, clientId: validClientId }),
    ).toMatchObject({ clientId: validClientId });

    const withoutClient = buildCreateUserPayload({ ...VALID_STATE, clientId: '' });
    expect(withoutClient).not.toHaveProperty('clientId');
  });
});

describe('buildUpdateUserPayload', () => {
  it('produz UpdateUserPayload sem password, com active sempre presente', () => {
    expect(
      buildUpdateUserPayload({
        ...VALID_STATE,
        name: '  Alice v2  ',
        email: '  alice2@example.com  ',
        identity: '  7  ',
        active: false,
      }),
    ).toEqual({
      name: 'Alice v2',
      email: 'alice2@example.com',
      identity: 7,
      active: false,
    });
  });

  it('inclui clientId trimado quando informado e omite quando vazio', () => {
    const validClientId = '22222222-2222-2222-2222-222222222222';
    expect(
      buildUpdateUserPayload({ ...VALID_STATE, clientId: '  ' + validClientId + '  ' }),
    ).toMatchObject({ clientId: validClientId });

    const withoutClient = buildUpdateUserPayload({ ...VALID_STATE, clientId: '' });
    expect(withoutClient).not.toHaveProperty('clientId');
  });
});
