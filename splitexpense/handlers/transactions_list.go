package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type TransactionsListRequest struct {
	Offset int32 `json:"offset"`
}

type TransactionsListResponse struct {
	Transactions       []common.Transaction                `json:"transactions"`
	TransactionDetails map[string][]common.TransactionUser `json:"transactionDetails"`
}

func TransactionsListHandler(w http.ResponseWriter, r *http.Request) {
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

	var req TransactionsListRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
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
		http.Error(w, "[transactions_list] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	startFrom := time.Now().Format("2006-01-02 15:04:05")

	entries := []common.Transaction{}
	tx := db.Raw(`
		SELECT id, description, amount, strftime('%Y-%m-%dT%H:%M:%S', created_at) || '.000Z' as created_at, COALESCE(metadata, '{}') as metadata, currency, transaction_id, group_id, strftime('%Y-%m-%dT%H:%M:%S', deleted) || '.000Z' as deleted 
		FROM transactions 
		WHERE datetime(created_at) < datetime(?) AND group_id = ? AND deleted IS NULL 
		ORDER BY datetime(created_at) DESC 
		LIMIT ? OFFSET ?
	`, startFrom, session.Group.Groupid, 5, int(req.Offset)).Scan(&entries)

	if tx.Error != nil {
		http.Error(w, "[transactions_list] error reading transactions from db: "+tx.Error.Error(), http.StatusInternalServerError)
		return
	}

	txnIds := []string{}
	for _, entry := range entries {
		txnIds = append(txnIds, entry.TransactionId)
	}

	txnUsers := []common.TransactionUser{}
	tx = db.Raw(`
		SELECT transaction_id, user_id, amount, owed_to_user_id, group_id, currency, strftime('%Y-%m-%dT%H:%M:%S', deleted) || '.000Z' as deleted 
		FROM transaction_users 
		WHERE transaction_id IN ?
	`, txnIds).Scan(&txnUsers)

	if tx.Error != nil {
		http.Error(w, "[transactions_list] error reading transaction users from db: "+tx.Error.Error(), http.StatusInternalServerError)
		return
	}

	txnUserMap := map[string][]common.TransactionUser{}
	for _, txnUser := range txnUsers {
		txnUserMap[txnUser.TransactionId] = append(txnUserMap[txnUser.TransactionId], txnUser)
	}

	b, _ := json.Marshal(TransactionsListResponse{
		Transactions:       entries,
		TransactionDetails: txnUserMap,
	})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}
