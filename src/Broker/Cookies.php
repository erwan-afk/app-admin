<?php

declare(strict_types=1);

namespace MediaStart\Auth\Broker;

/**
 * Use global $_COOKIE and setcookie() to persist the client token.
 *
 * @implements \ArrayAccess<string,mixed>
 * @codeCoverageIgnore
 */
class Cookies implements \ArrayAccess
{
    /** @var int */
    protected int $ttl;

    /** @var string */
    protected string $path;

    /** @var string */
    protected string $domain;

    /** @var bool */
    protected bool $secure;

    /** @var string */
    protected string $sameSite;

    public function __construct(
        int $ttl = 3600,
        string $path = '',
        string $domain = '',
        ?bool $secure = null,
        string $sameSite = 'Lax',
    ) {
        $this->ttl = $ttl;
        $this->path = $path;
        $this->domain = $domain;
        $this->secure = $secure ?? (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? 'off') !== 'off');
        $this->sameSite = $sameSite;
    }

    /**
     * @inheritDoc
     */
    public function offsetExists(mixed $offset): bool
    {
        return isset($_COOKIE[$offset]);
    }

    /**
     * @inheritDoc
     */
    public function offsetGet(mixed $offset): mixed
    {
        return $_COOKIE[$offset] ?? null;
    }

    /**
     * @inheritDoc
     */
    public function offsetSet(mixed $offset, mixed $value): void
    {
        $success = setcookie($offset, $value, [
            'expires' => time() + $this->ttl,
            'path' => $this->path,
            'domain' => $this->domain,
            'secure' => $this->secure,
            'httponly' => true,
            'samesite' => $this->sameSite,
        ]);

        if (!$success) {
            throw new \RuntimeException("Failed to set cookie '$offset'");
        }

        $_COOKIE[$offset] = $value;
    }

    /**
     * @inheritDoc
     */
    public function offsetUnset(mixed $offset): void
    {
        setcookie($offset, '', [
            'expires' => 1,
            'path' => $this->path,
            'domain' => $this->domain,
            'secure' => $this->secure,
            'httponly' => true,
            'samesite' => $this->sameSite,
        ]);
        unset($_COOKIE[$offset]);
    }
}
