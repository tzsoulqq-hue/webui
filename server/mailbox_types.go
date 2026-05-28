package main

type upsertMailboxRequest struct {
	MailboxID    string `json:"mailbox_id"`
	Email        string `json:"email"`
	Password     string `json:"password"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	Provider     string `json:"provider"`
	Status       string `json:"status"`
	AuthStatus   string `json:"auth_status"`
	LastError    string `json:"last_error"`
	HomeCountry  string `json:"home_country"`
	HomeIP       string `json:"home_ip"`
	ProxyProfile string `json:"proxy_profile"`
}

type mailboxOAuthRequest struct {
	EmailAddress string `json:"email_address"`
	OnlyMissing  bool   `json:"only_missing"`
	Limit        int32  `json:"limit"`
}

type mailboxRegisterRequest struct {
	MaxCount int32 `json:"max_count"`
}

type mailboxLocalOAuthRequest struct {
	EmailAddress string `json:"email_address"`
}

type mailboxLocalOAuthCompleteRequest struct {
	EmailAddress string `json:"email_address"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
}

type mailboxManualRecoveryRequest struct {
	EmailAddress string `json:"email_address"`
}

type mailboxInboxRequest struct {
	LimitPerMailbox int32  `json:"limit_per_mailbox"`
	MaxMailboxes    int32  `json:"max_mailboxes"`
	EmailAddress    string `json:"email_address"`
	ParserProfile   string `json:"parser_profile"`
}
