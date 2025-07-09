package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type TransactionBalances struct {
	UserId       int32   `json:"user_id"`
	Amount       float64 `json:"amount"`
	OwedToUserId int32   `json:"owed_to_user_id"`
	Currency     string  `json:"currency"`
}

func BalancesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodOptions {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	valid, session := common.Authenticate(r)
	if !valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		http.Error(w, "Internal server error: DSN not configured", http.StatusInternalServerError)
		return
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		http.Error(w, "[balances] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	balances := []TransactionBalances{}
	tx := db.Model(&common.TransactionUser{}).Select("user_id, owed_to_user_id, currency, sum(amount) as amount").Where("group_id = ? and deleted is null", session.Group.Groupid).Group("user_id, owed_to_user_id, currency").Find(&balances)
	if tx.Error != nil {
		log.Printf("failed to query balances: %v", tx.Error)
		http.Error(w, "[balances] failed to query db", http.StatusServiceUnavailable)
		return
	}

	balancesByUser := map[string]map[string]float64{}
	for _, balance := range balances {
		if balance.UserId == balance.OwedToUserId {
			continue
		}
		if balance.UserId == session.User.Id {
			if _, ok := balancesByUser[session.UsersById[balance.OwedToUserId].FirstName]; !ok {
				balancesByUser[session.UsersById[balance.OwedToUserId].FirstName] = map[string]float64{}
			}
			balancesByUser[session.UsersById[balance.OwedToUserId].FirstName][balance.Currency] -= balance.Amount
		} else if balance.OwedToUserId == session.User.Id {
			if _, ok := balancesByUser[session.UsersById[balance.UserId].FirstName]; !ok {
				balancesByUser[session.UsersById[balance.UserId].FirstName] = map[string]float64{}
			}
			balancesByUser[session.UsersById[balance.UserId].FirstName][balance.Currency] += balance.Amount
		}
	}

	b, err := json.Marshal(balancesByUser)
	if err != nil {
		http.Error(w, "failed to marshal response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}
